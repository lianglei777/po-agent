import { describe, expect, it } from "vitest";
import { parseKlingFaceAnalysis } from "./runninghub-lip-sync-provider";

describe("parseKlingFaceAnalysis", () => {
  it("extracts a session and valid face intervals from nested text output", () => {
    const parsed = parseKlingFaceAnalysis({ status: "SUCCESS" }, [JSON.stringify({
      data: {
        session_id: "session-1",
        face_list: [
          { face_id: "0", face_image_url: "https://assets.test/face-0.png", start_time: 500, end_time: 5_500 },
          { face_id: "1", start_time: 8_000, end_time: 9_000 },
        ],
      },
    })]);

    expect(parsed).toEqual({
      sessionId: "session-1",
      faces: [{
        key: "face-1",
        providerFaceId: "0",
        previewUrl: "https://assets.test/face-0.png",
        availableStartMs: 500,
        availableEndMs: 5_500,
      }],
    });
  });

  it("returns null when a session identifier is missing", () => {
    expect(parseKlingFaceAnalysis({ faces: [{ faceId: "0", start: 0, end: 3_000 }] }, []))
      .toBeNull();
  });
});
