export interface ReportCardSubject {
  examSubjectId: string;
  subjectId: string;
  subjectCode: string | null;
  subjectName: string | null;
  examDate: string | null;
  maxMarks: number;
  passMarks: number | null;
  marksObtained: number | null;
  remarks: string | null;
  status: 'entered' | 'notEntered';
}

export interface ReportCard {
  student: { id: string; admissionNumber: string; fullName: string | null };
  exam: { id: string; name: string; academicYearId: string; startDate: string | null; endDate: string | null };
  class: { id: string; name: string; section: string };
  scope: 'allSubjects' | 'assignedSubjects';
  subjects: ReportCardSubject[];
  summary: {
    subjectsConfigured: number;
    subjectsWithMarks: number;
    complete: boolean;
    totalMarksObtained: number | null;
    totalMaxMarks: number | null;
  };
}
