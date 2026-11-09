import { NextResponse } from 'next/server';
// @ts-expect-error NodeMailer lacks full types here without @types/nodemailer
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { to, subject, body, attachmentName, attachmentPath, level, emailConfig } = await req.json();
    const delfLevel = level || 'B2';

    if (!to || !attachmentPath) {
      return NextResponse.json({ error: 'Email destinataire et chemin du PDF requis.' }, { status: 400 });
    }

    // Vérifier si le fichier existe
    if (!fs.existsSync(attachmentPath)) {
      return NextResponse.json({ error: 'Fichier PDF introuvable : ' + attachmentPath }, { status: 404 });
    }

    const emailUser = emailConfig?.user || process.env.EMAIL_USER;
    const emailPass = emailConfig?.pass || process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
      return NextResponse.json({ error: 'Identifiants email non configurés (ni dans Maintenance, ni dans .env).' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    const mailOptions = {
      from: `"Le Prof et l'IA" <${emailUser}>`,
      to: to,
      subject: subject || `Votre bilan de production écrite DELF ${delfLevel}`,
      text: body || "Bonjour,\n\nVoici la correction de votre production.\n\nBien cordialement,\n\nL'équipe pédagogique",
      attachments: [
        {
          filename: attachmentName || `Bilan_DELF_${delfLevel}.pdf`,
          path: attachmentPath,
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    return NextResponse.json({ success: true, messageId: info.messageId });

  } catch (error: any) {
    console.error('Erreur API Email:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne lors de l\'envoi de l\'e-mail' }, { status: 500 });
  }
}
