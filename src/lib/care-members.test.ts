import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer, type Plugin } from "vite";

type MemberRow = {
  id: string;
  household_id: string;
  device_id: string;
  role: "caregiver";
  name: string;
  contact: string;
  is_primary: boolean;
  joined_at: string;
  last_seen_at: string;
};

const households = new Map<string, string>();
const members: MemberRow[] = [];
let clock = 0;
let server: Awaited<ReturnType<typeof createServer>>;

function nextTimestamp(): string {
  clock += 1;
  return new Date(clock * 1_000).toISOString();
}

const fakeSql = async <T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> => {
  const query = strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();

  if (query.includes("select patient_name from households")) {
    const code = String(values[0]);
    return (households.has(code) ? [{ patient_name: households.get(code) }] : []) as T[];
  }

  if (query.includes("insert into household_members")) {
    const id = String(values[0]);
    const deviceId = String(values[1]);
    const name = String(values[2]);
    const contact = String(values[3]);
    const code = String(values[4]);
    if (!households.has(code)) return [];

    if (query.includes("not exists")) {
      if (members.some((member) => member.household_id === code)) return [];
      const timestamp = nextTimestamp();
      const member: MemberRow = {
        id,
        household_id: code,
        device_id: deviceId,
        role: "caregiver",
        name,
        contact,
        is_primary: true,
        joined_at: timestamp,
        last_seen_at: timestamp,
      };
      members.push(member);
      return [member] as T[];
    }

    const existing = members.find(
      (member) => member.household_id === code && member.device_id === deviceId,
    );
    if (existing) {
      existing.name = name;
      existing.contact = contact;
      existing.last_seen_at = nextTimestamp();
      return [existing] as T[];
    }

    const timestamp = nextTimestamp();
    const member: MemberRow = {
      id,
      household_id: code,
      device_id: deviceId,
      role: "caregiver",
      name,
      contact,
      is_primary: false,
      joined_at: timestamp,
      last_seen_at: timestamp,
    };
    members.push(member);
    return [member] as T[];
  }

  if (query.includes("from household_members")) {
    const code = String(values[0]);
    const rows = members.filter(
      (member) => member.household_id === code && member.role === "caregiver",
    );
    if (query.includes("order by is_primary desc, joined_at asc")) {
      rows.sort(
        (a, b) =>
          Number(b.is_primary) - Number(a.is_primary) ||
          a.joined_at.localeCompare(b.joined_at) ||
          a.id.localeCompare(b.id),
      );
    }
    return rows as T[];
  }

  throw new Error(`Unexpected mocked SQL query: ${query}`);
};

const plugin: Plugin = {
  name: "care-member-test-mocks",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer?.endsWith("/src/lib/care.ts")) return;
    if (source === "@tanstack/react-start") return "\0care-member-server-fn";
    if (source === "./db") return "\0care-member-db";
    if (source === "./push.server") return "\0care-member-push";
    return;
  },
  load(id) {
    if (id === "\0care-member-server-fn") {
      return [
        "export function createServerFn() {",
        "  let validate = (value) => value;",
        "  const builder = {",
        "    validator(fn) { validate = fn; return builder; },",
        "    handler(fn) { return ({ data }) => fn({ data: validate(data) }); },",
        "  };",
        "  return builder;",
        "}",
      ].join("\n");
    }
    if (id === "\0care-member-db") {
      return "export async function getSql() { return globalThis.__careMemberTestSql; }";
    }
    if (id === "\0care-member-push") {
      return "export async function sendPushToHousehold() {}";
    }
    return;
  },
};

before(async () => {
  const root = new URL("../../", import.meta.url).pathname;
  server = await createServer({
    configFile: false,
    root,
    appType: "custom",
    server: { middlewareMode: true },
    ssr: { noExternal: ["@tanstack/react-start"] },
    plugins: [plugin],
  });
});

after(async () => {
  await server?.close();
  delete (globalThis as typeof globalThis & { __careMemberTestSql?: typeof fakeSql })
    .__careMemberTestSql;
});

beforeEach(() => {
  households.clear();
  households.set("FAM42X", "Margaret");
  members.length = 0;
  clock = 0;
  (globalThis as typeof globalThis & { __careMemberTestSql?: typeof fakeSql })
    .__careMemberTestSql = fakeSql;
});

async function loadCare() {
  return server.ssrLoadModule("/src/lib/care.ts") as Promise<{
    joinHousehold: (input: {
      data: {
        familyCode: string;
        caregiverName: string;
        caregiverContact?: string;
        deviceId: string;
      };
    }) => Promise<
      | { ok: true; member: { isPrimary: boolean; name: string; joinedAt: string; lastSeenAt: string } }
      | { ok: false; error: string }
    >;
    getHousehold: (input: { data: { code: string } }) => Promise<
      | {
          ok: true;
          caregivers: { name: string; isPrimary: boolean; joinedAt: string }[];
        }
      | { ok: false; error: string }
    >;
  }>;
}

test("Phone 2 join creates a caregiver record on the server", async () => {
  const { joinHousehold } = await loadCare();
  const result = await joinHousehold({
    data: {
      familyCode: "fam42x",
      caregiverName: "Alex",
      caregiverContact: "alex@example.com",
      deviceId: "dev_device2",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(members.length, 1);
  assert.deepEqual(
    {
      household: members[0].household_id,
      device: members[0].device_id,
      role: members[0].role,
      name: members[0].name,
      contact: members[0].contact,
    },
    {
      household: "FAM42X",
      device: "dev_device2",
      role: "caregiver",
      name: "Alex",
      contact: "alex@example.com",
    },
  );
});

test("first caregiver is primary and later caregivers are not", async () => {
  const { joinHousehold } = await loadCare();
  const first = await joinHousehold({
    data: { familyCode: "FAM42X", caregiverName: "Alex", deviceId: "dev_device1" },
  });
  const second = await joinHousehold({
    data: { familyCode: "FAM42X", caregiverName: "Bea", deviceId: "dev_device2" },
  });

  assert.equal(first.ok && first.member.isPrimary, true);
  assert.equal(second.ok && second.member.isPrimary, false);
  assert.equal(members.filter((member) => member.is_primary).length, 1);
});

test("re-joining from the same device updates lastSeenAt without a duplicate", async () => {
  const { joinHousehold } = await loadCare();
  const input = {
    data: { familyCode: "FAM42X", caregiverName: "Alex", deviceId: "dev_device1" },
  };
  const first = await joinHousehold(input);
  const second = await joinHousehold(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(members.length, 1);
  assert.equal(members[0].is_primary, true);
  assert.equal(members[0].joined_at, first.ok ? first.member.joinedAt : "");
  assert.notEqual(members[0].last_seen_at, first.ok ? first.member.lastSeenAt : "");
});

test("unknown family code returns an error and creates no member", async () => {
  const { joinHousehold } = await loadCare();
  const result = await joinHousehold({
    data: { familyCode: "BAD42X", caregiverName: "Alex", deviceId: "dev_device1" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /could not find that code/i);
  assert.equal(members.length, 0);
});

test("getHousehold returns caregivers primary-first and then by join time", async () => {
  const { joinHousehold, getHousehold } = await loadCare();
  await joinHousehold({
    data: { familyCode: "FAM42X", caregiverName: "Alex", deviceId: "dev_device1" },
  });
  await joinHousehold({
    data: { familyCode: "FAM42X", caregiverName: "Bea", deviceId: "dev_device2" },
  });
  await joinHousehold({
    data: { familyCode: "FAM42X", caregiverName: "Casey", deviceId: "dev_device3" },
  });
  members.reverse();

  const result = await getHousehold({ data: { code: "FAM42X" } });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.caregivers.map((member) => member.name), ["Alex", "Bea", "Casey"]);
    assert.deepEqual(result.caregivers.map((member) => member.isPrimary), [true, false, false]);
  }
});
