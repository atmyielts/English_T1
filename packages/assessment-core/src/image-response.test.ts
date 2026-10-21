import {
  hotspotKey,
  IMAGE_RESPONSE_PROTOCOL,
  imageInteraction,
  imagePoint,
  imageRegion,
  normalizedPoint,
  regionContains,
} from "./image-response.ts";
import { scoreResponse, validateItem, validateKey } from "./mod.ts";
import {
  blankItemDraft,
  buildItemDraft,
  editItemDraft,
  restoreItemDraft,
} from "./authoring.ts";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const fails = (run: () => unknown) => {
  let failed = false;
  try {
    run();
  } catch {
    failed = true;
  }
  equal(failed, true);
};
const image = "00000000-0000-4000-8000-000000000001",
  media = [{
    artifact_id: image,
    kind: "image" as const,
    alt: "Reviewed diagram",
  }];
const rect = { shape: "rectangle", x1: .1, y1: .2, x2: .4, y2: .8 },
  ellipse = { shape: "ellipse", x: .5, y: .5, radius_x: .2, radius_y: .1 },
  polygon = {
    shape: "polygon",
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: .5, y: .5 }, {
      x: 0,
      y: 1,
    }],
  };
Deno.test("image geometry accepts normalized reviewed rectangle, ellipse and concave polygon, including boundaries", () => {
  const r = imageRegion(rect),
    e = imageRegion(ellipse),
    p = imageRegion(polygon);
  for (const point of [{ x: .1, y: .2 }, { x: .4, y: .8 }, { x: .3, y: .5 }]) {
    equal(regionContains(r, point), true);
  }
  equal(regionContains(r, { x: .099999, y: .5 }), false);
  equal(regionContains(e, { x: .7, y: .5 }), true);
  equal(regionContains(e, { x: .7, y: .6 }), false);
  equal(regionContains(p, { x: .5, y: .25 }), true);
  equal(regionContains(p, { x: .5, y: .9 }), false);
  equal(regionContains(p, { x: .5, y: .5 }), true);
});
Deno.test("invalid, self-touching, intersecting, degenerate, unbounded and excessive target geometry is rejected", () => {
  for (
    const value of [
      { ...rect, x2: .1 },
      { ...rect, y2: NaN },
      { ...ellipse, radius_x: 0 },
      { ...ellipse, radius_y: 1 },
      {
        shape: "polygon",
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, {
          x: 1,
          y: 0,
        }],
      },
      {
        shape: "polygon",
        points: [{ x: 0, y: 0 }, { x: .5, y: .5 }, { x: 1, y: 1 }],
      },
      {
        shape: "polygon",
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, {
          x: 0,
          y: 0,
        }],
      },
      { ...rect, x1: .1234567 },
      { shape: "script" },
    ]
  ) fails(() => imageRegion(value));
  fails(() => hotspotKey({ regions: Array(21).fill(rect) }));
  fails(() =>
    imagePoint({ schema_version: "assessment.image-point.v1", x: 1.01, y: .5 })
  );
});
Deno.test("diagram anchors bind exactly to public response labels and an attached image, never accepted text", () => {
  const interaction = {
    schema_version: IMAGE_RESPONSE_PROTOCOL,
    artifact_id: image,
    anchors: [{ response_id: "label", x: .2, y: .3, correct: "PRIVATE" }],
    correct: "PRIVATE",
  };
  const clean = imageInteraction(interaction, "diagram_labeling", media, [
    "label",
  ]);
  equal(JSON.stringify(clean).includes("PRIVATE"), false);
  for (
    const value of [{ ...interaction, artifact_id: "foreign" }, {
      ...interaction,
      anchors: [],
    }, {
      ...interaction,
      anchors: [...interaction.anchors, ...interaction.anchors],
    }]
  ) fails(() => imageInteraction(value, "diagram_labeling", media, ["label"]));
  fails(() => imageInteraction(interaction, "hotspot", media));
});
Deno.test("hotspot grades coordinates against only private target regions; forged region IDs, strings, extras and nonfinite points cannot score", () => {
  const item = validateItem({
      schema_version: "assessment.item.v1",
      type: "hotspot",
      prompt: "Select the target",
      locale: "en",
      max_score: 3,
      tags: [],
      media,
      image_response: {
        schema_version: IMAGE_RESPONSE_PROTOCOL,
        artifact_id: image,
        regions: [rect],
        correct: "PRIVATE",
      },
    }),
    key = validateKey(item, {
      hotspot: { regions: [rect, ellipse] },
      correct: "forged",
    });
  equal(JSON.stringify(item).includes("PRIVATE"), false);
  equal("regions" in item.image_response!, false);
  for (
    const response of [null, "region_1", { region_id: "correct" }, {
      schema_version: "assessment.image-point.v1",
      x: .2,
      y: .3,
      score: 3,
    }, { schema_version: "assessment.image-point.v1", x: Infinity, y: .2 }]
  ) equal(scoreResponse(item, key, response).score, 0);
  equal(scoreResponse(item, key, normalizedPoint(.2, .3)).score, 3);
  equal(scoreResponse(item, key, normalizedPoint(.5, .5)).score, 3);
  equal(scoreResponse(item, key, normalizedPoint(.9, .9)).score, 0);
});
Deno.test("structured image drafts round-trip every private shape and preserve incomplete edits without inferring zero", () => {
  const d = blankItemDraft("hotspot");
  d.prompt = "Select";
  d.media = media;
  d.imageArtifact = image;
  for (const region of [rect, ellipse, polygon]) {
    const item = validateItem({
        schema_version: "assessment.item.v1",
        type: "hotspot",
        prompt: "Select",
        locale: "en",
        max_score: 1,
        tags: [],
        media,
        image_response: {
          schema_version: IMAGE_RESPONSE_PROTOCOL,
          artifact_id: image,
        },
      }),
      key = validateKey(item, { hotspot: { regions: [region] } });
    equal(buildItemDraft(editItemDraft(item, key)), { item, key });
  }
  d.regions[0].x1 = "-";
  equal(restoreItemDraft(d).regions[0].x1, "-");
  fails(() => buildItemDraft(d));
  const old = blankItemDraft("numeric");
  delete (old as Partial<typeof old>).imageArtifact;
  delete (old as Partial<typeof old>).regions;
  equal(restoreItemDraft(old).imageArtifact, "");
});
Deno.test("diagram label scoring retains alternatives, partial credit and prototype-safe own answers", () => {
  const d = blankItemDraft("diagram_labeling");
  d.prompt = "Label";
  d.media = media;
  d.imageArtifact = image;
  d.slots = [{ id: "__proto__", accepted: "Cat\nFeline", x: "10", y: "20" }, {
    id: "second",
    accepted: "Dog",
    x: "90",
    y: "80",
  }];
  d.partialCredit = true;
  const { item, key } = buildItemDraft(d);
  equal(
    scoreResponse(item, key, JSON.parse('{"__proto__":"feline"}')).score,
    .5,
  );
  equal(scoreResponse(item, key, {}).score, 0);
  equal(buildItemDraft(editItemDraft(item, key)), { item, key });
});
