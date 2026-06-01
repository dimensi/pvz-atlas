import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    points: [],
    owners: [],
    visits: [],
    conflicts: [],
    serverTime: new Date().toISOString(),
    warnings: ["Адаптер чтения из Google Sheets еще не реализован."]
  });
}
