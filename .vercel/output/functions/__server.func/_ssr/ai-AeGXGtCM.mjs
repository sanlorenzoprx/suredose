import { r as defaultTimesForCount } from "./schedule-9vyAbRE2.mjs";
import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as object, i as number, n as boolean, o as string, t as array } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ai-AeGXGtCM.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var imageSchema = string().min(20).max(35e5);
function extractJson(text) {
	const raw = (text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text).trim();
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("AI did not return usable data.");
	return JSON.parse(raw.slice(start, end + 1));
}
async function grokVision(opts) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "AI is not available right now."
	};
	const content = [{
		type: "text",
		text: opts.prompt
	}];
	for (const url of opts.images) content.push({
		type: "image_url",
		image_url: {
			url,
			detail: "high"
		}
	});
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			temperature: 0,
			max_tokens: opts.maxTokens,
			messages: [{
				role: "user",
				content
			}]
		})
	});
	if (!res.ok) return {
		ok: false,
		error: `Could not read this photo (${res.status}).`
	};
	const text = (await res.json()).choices?.[0]?.message?.content ?? "";
	if (!text) return {
		ok: false,
		error: "AI did not return a result."
	};
	return {
		ok: true,
		text
	};
}
var bottleResult = object({
	name: string(),
	strength: string().optional().default(""),
	timesPerDay: number().optional(),
	times: array(string()).optional(),
	instructions: string().optional().default("")
});
var readBottleLabel_createServerFn_handler = createServerRpc({
	id: "2a722a22c88f1a0e65cefd13d14e3055eaad3e46b4b81a17a7a39c6197f8d443",
	name: "readBottleLabel",
	filename: "src/lib/ai.ts"
}, (opts) => readBottleLabel.__executeServer(opts));
var readBottleLabel = createServerFn({ method: "POST" }).validator((input) => ({ image: imageSchema.parse(input.image) })).handler(readBottleLabel_createServerFn_handler, async ({ data }) => {
	const vision = await grokVision({
		maxTokens: 500,
		images: [data.image],
		prompt: `You read pharmacy prescription bottle labels for older adults.
Return ONLY JSON with this shape:
{
  "name": "medicine name without strength",
  "strength": "e.g. 10 mg",
  "timesPerDay": 1,
  "times": ["08:00"],
  "instructions": "short plain-language directions"
}
Rules:
- times use 24-hour HH:mm
- If the label says once daily, timesPerDay=1 and times=["08:00"] unless a time is printed
- twice daily → ["08:00","20:00"]
- three times daily → ["08:00","14:00","20:00"]
- every morning → ["08:00"]; every night → ["21:00"]
- If you cannot read a field, use an empty string or best guess
- No markdown`
	});
	if (!vision.ok) return vision;
	try {
		const parsed = bottleResult.parse(extractJson(vision.text));
		const count = Math.min(4, Math.max(1, Math.round(parsed.timesPerDay ?? parsed.times?.length ?? 1)));
		const times = parsed.times && parsed.times.length > 0 ? parsed.times : defaultTimesForCount(count);
		return {
			ok: true,
			bottle: {
				name: parsed.name.trim() || "Medicine",
				strength: parsed.strength.trim(),
				timesPerDay: count,
				times,
				instructions: parsed.instructions.trim()
			}
		};
	} catch {
		return {
			ok: false,
			error: "Could not read the bottle. You can type the name instead."
		};
	}
});
var matchResult = object({
	match: boolean(),
	confidence: number(),
	reason: string()
});
var comparePills_createServerFn_handler = createServerRpc({
	id: "63a79891fcb37df693e3223573ca07147bc34e6bd6437df2d821e16f55c76352",
	name: "comparePills",
	filename: "src/lib/ai.ts"
}, (opts) => comparePills.__executeServer(opts));
var comparePills = createServerFn({ method: "POST" }).validator((input) => ({
	reference: imageSchema.parse(input.reference),
	candidate: imageSchema.parse(input.candidate),
	name: string().max(80).parse(input.name ?? "")
})).handler(comparePills_createServerFn_handler, async ({ data }) => {
	const vision = await grokVision({
		maxTokens: 350,
		images: [data.reference, data.candidate],
		prompt: `You compare two photos of pills for a medication safety app used by older adults.
Image 1 is the SAVED reference photo of ${data.name || "the prescribed pill"}.
Image 2 is the pill the person is about to take now.

Decide if they are the same medicine (same shape, color, size, coating, and imprint if visible).
Ignore background, lighting, camera angle, and hands.
If Image 2 is not a pill, match=false.

Return ONLY JSON:
{
  "match": true,
  "confidence": 0.0,
  "reason": "one short sentence in plain English, no jargon"
}
confidence is 0 to 1. Be conservative if unsure.`
	});
	if (!vision.ok) return vision;
	try {
		const parsed = matchResult.parse(extractJson(vision.text));
		return {
			ok: true,
			result: {
				match: parsed.match,
				confidence: Math.min(1, Math.max(0, parsed.confidence)),
				reason: parsed.reason.trim() || (parsed.match ? "These look like the same pill." : "These do not look like the same pill.")
			}
		};
	} catch {
		return {
			ok: false,
			error: "Could not check this pill. Look at both photos and decide carefully."
		};
	}
});
//#endregion
export { comparePills_createServerFn_handler, readBottleLabel_createServerFn_handler };
