import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { isSafeId } from '@/lib/pathSafety';

const PENDING_DIR = path.join(process.cwd(), 'data', 'pending');

async function ensureDir() {
  try {
    await fs.mkdir(PENDING_DIR, { recursive: true });
  } catch (e) {}
}

export async function GET() {
  try {
    await ensureDir();
    const files = await fs.readdir(PENDING_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const list = [];
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(PENDING_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        list.push({
          id: data.id,
          studentName: data.studentName || 'Inconnu',
          studentEmail: data.studentEmail || '',
          classId: data.classId || null,
          className: data.className || null,
          subject: data.subject || '',
          level: data.level || 'B2',
          dateCreated: data.dateCreated || new Date().toISOString(),
          status: data.status || 'en_attente_partie2'
        });
      } catch (err) {
        console.error(`[PO pending] Error reading draft file ${file}:`, err);
      }
    }

    list.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("[PO pending] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureDir();
    const body = await req.json();

    const id = body.id || Date.now().toString();
    if (!isSafeId(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const filePath = path.join(PENDING_DIR, `${id}.json`);
    const draftData = {
      ...body,
      id,
      dateCreated: body.dateCreated || new Date().toISOString()
    };

    await fs.writeFile(filePath, JSON.stringify(draftData, null, 2), 'utf8');
    return NextResponse.json({ success: true, id, draft: draftData });
  } catch (error: any) {
    console.error("[PO pending] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
