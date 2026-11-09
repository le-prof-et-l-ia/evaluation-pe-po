import { NextResponse } from 'next/server';
// @ts-expect-error NodeMailer lacks full types here without @types/nodemailer
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { user, pass } = await req.json();

    if (!user || !pass) {
      return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user,
        pass: pass,
      },
    });

    // Vérifier la connexion
    await transporter.verify();
    
    return NextResponse.json({ success: true, message: 'Connexion réussie !' });

  } catch (error: any) {
    console.error('Erreur Test Email:', error);
    let message = error.message || 'Erreur lors de la vérification';
    
    if (message.includes('Invalid login') || message.includes('EAUTH')) {
      message = 'Identifiants invalides ou mot de passe d\'application incorrect.';
    }
    
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
