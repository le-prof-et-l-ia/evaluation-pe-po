import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const CLASSES_FILE_PATH = path.join(process.cwd(), "data", "classes.json");

export interface Student {
  id: string;
  name: string;
  email: string;
}

export interface ClassData {
  id: string;
  name: string;
  students: Student[];
}

async function getClassesData(): Promise<ClassData[]> {
  try {
    const data = await fs.readFile(CLASSES_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // Return empty if file does not exist
      return [];
    }
    throw err;
  }
}

async function saveClassesData(data: ClassData[]): Promise<void> {
  // Ensure data dir exists
  const dir = path.dirname(CLASSES_FILE_PATH);
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
  await fs.writeFile(CLASSES_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function GET() {
  try {
    const classes = await getClassesData();
    return NextResponse.json(classes);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, classData, classesToMerge, studentEmailUpdates } = body;

    let currentClasses = await getClassesData();

    if (action === "ADD_CLASS" && classData) {
      // Check if class already exists, if so merge students
      const existingClass = currentClasses.find(c => c.name === classData.name);
      if (existingClass) {
        existingClass.students = classData.students; // Overwrite or merge
      } else {
        currentClasses.push({
          id: classData.id || Date.now().toString(),
          name: classData.name,
          students: classData.students
        });
      }
    } else if (action === "MERGE_CLASSES" && classesToMerge) {
       for(const c of classesToMerge) {
           const existing = currentClasses.find(ec => ec.name === c.name);
           if (existing) {
               // Update existing students or add new ones
               c.students.forEach((s: Student) => {
                   // On n'apparie que sur des valeurs non vides : deux élèves
                   // sans email ("" === "") ne doivent pas être confondus.
                   const existingStudent = existing.students.find(es =>
                       (!!s.email && es.email === s.email) || (!!s.name && es.name === s.name));
                   if (existingStudent) {
                       existingStudent.email = s.email; // update email if changed
                       existingStudent.name = s.name;
                   } else {
                       existing.students.push(s);
                   }
               });
           } else {
               currentClasses.push({ ...c, id: c.id || Date.now().toString() });
           }
       }
    } else if (action === "UPDATE_STUDENT_EMAIL" && studentEmailUpdates) {
       const { classId, studentId, email } = studentEmailUpdates;
       const cls = currentClasses.find(c => c.id === classId);
       if (cls) {
           const stu = cls.students.find(s => s.id === studentId);
           if (stu) {
               stu.email = email;
           }
       }
    } else if (action === "UPDATE_CLASS_NAME" && body.classId && body.newName) {
        const cls = currentClasses.find(c => c.id === body.classId);
        if (cls) cls.name = body.newName;
    } else if (action === "DELETE_CLASS" && body.classId) {
        currentClasses = currentClasses.filter(c => c.id !== body.classId);
    }

    await saveClassesData(currentClasses);
    return NextResponse.json({ success: true, classes: currentClasses });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
