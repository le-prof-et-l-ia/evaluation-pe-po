import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: "L'arbitrage automatisé par API a été désactivé." }, { status: 410 });
}
