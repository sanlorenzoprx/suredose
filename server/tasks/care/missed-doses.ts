import { defineTask } from "nitro/task";
import { getSql } from "../../../src/lib/db";
import { sendPushToHousehold } from "../../../src/lib/push.server";
import { runMissedDoses } from "../../../src/lib/missed-dose.server";

export default defineTask({
  meta: {
    name: "care:missed-doses",
    description: "Alert caregivers about overdue patient-local dose slots.",
  },
  async run() {
    return runMissedDoses(await getSql(), sendPushToHousehold);
  },
});
