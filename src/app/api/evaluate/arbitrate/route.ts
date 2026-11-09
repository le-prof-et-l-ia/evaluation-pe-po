import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: "La triple évaluation (arbitrage) a été retirée." }, { status: 410 });
}
