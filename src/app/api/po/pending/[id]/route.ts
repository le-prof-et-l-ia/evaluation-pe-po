import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { isSafeId } from '@/lib/pathSafety';

const PENDING_DIR = path.join(process.cwd(), 'data', 'pending');

function draftFilePath(id: unknown): string | null {
  return isSafeId(id) ? path.join(PENDING_DIR, `${id}.json`) : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const filePath = draftFilePath(id);
    if (!filePath) {
      return NextResponse.json({ error: 'Identifiant de brouillon invalide' }, { status: 400 });
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return NextResponse.json(JSON.parse(content));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json({ error: 'Brouillon non trouvé' }, { status: 404 });
      }
      throw err;
    }
  } catch (error: any) {
    console.error("[PO pending [id]] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const filePath = draftFilePath(id);
    if (!filePath) {
      return NextResponse.json({ error: 'Identifiant de brouillon invalide' }, { status: 400 });
    }

    try {
      await fs.unlink(filePath);
      return NextResponse.json({ success: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json({ error: 'Brouillon non trouvé ou déjà supprimé' }, { status: 404 });
      }
      throw err;
    }
  } catch (error: any) {
    console.error("[PO pending [id]] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
