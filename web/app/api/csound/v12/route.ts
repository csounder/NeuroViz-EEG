import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

const V12_CSD_PATH =
  "/Users/richardboulanger/Desktop/MuscV12-EEG-Control-Matrix-Cursor.csd";

export async function GET() {
  try {
    const csd = await readFile(V12_CSD_PATH, "utf8");
    return new NextResponse(csd, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition":
          'inline; filename="MuscV12-EEG-Control-Matrix-Cursor.csd"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to read V12 CSD",
        path: V12_CSD_PATH,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
