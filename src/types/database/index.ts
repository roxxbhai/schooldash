
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "academicYears": {
                  Row: {
                    "createdAt": string,"endDate": string,"id": string,"isCurrent": boolean,"name": string,"startDate": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "createdAt"?: string,"endDate": string,"id"?: string,"isCurrent"?: boolean,"name": string,"startDate": string,"updatedAt"?: string
                  }
                  Update: {
                    "createdAt"?: string,"endDate"?: string,"id"?: string,"isCurrent"?: boolean,"name"?: string,"startDate"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    
                  ]
                },"auditLogs": {
                  Row: {
                    "action": string,"actorUserId": string | null,"createdAt": string,"entityId": string | null,"entityType": string,"id": string,"metadata": Json | null,"newData": Json | null,"oldData": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actorUserId"?: string | null,"createdAt"?: string,"entityId"?: string | null,"entityType": string,"id"?: string,"metadata"?: Json | null,"newData"?: Json | null,"oldData"?: Json | null
                  }
                  Update: {
                    "action"?: string,"actorUserId"?: string | null,"createdAt"?: string,"entityId"?: string | null,"entityType"?: string,"id"?: string,"metadata"?: Json | null,"newData"?: Json | null,"oldData"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditLogs_actorUserId_fkey"
      columns: ["actorUserId"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
                  Row: {
                    "academicYearId": string,"classTeacherId": string | null,"createdAt": string,"id": string,"name": string,"roomNumber": string | null,"section": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academicYearId": string,"classTeacherId"?: string | null,"createdAt"?: string,"id"?: string,"name": string,"roomNumber"?: string | null,"section": string,"updatedAt"?: string
                  }
                  Update: {
                    "academicYearId"?: string,"classTeacherId"?: string | null,"createdAt"?: string,"id"?: string,"name"?: string,"roomNumber"?: string | null,"section"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classes_academicYearId_fkey"
      columns: ["academicYearId"]
isOneToOne: false
      referencedRelation: "academicYears"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classes_classTeacherId_fkey"
      columns: ["classTeacherId"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"exams": {
                  Row: {
                    "academicYearId": string,"createdAt": string,"endDate": string | null,"id": string,"name": string,"startDate": string | null,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academicYearId": string,"createdAt"?: string,"endDate"?: string | null,"id"?: string,"name": string,"startDate"?: string | null,"updatedAt"?: string
                  }
                  Update: {
                    "academicYearId"?: string,"createdAt"?: string,"endDate"?: string | null,"id"?: string,"name"?: string,"startDate"?: string | null,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exams_academicYearId_fkey"
      columns: ["academicYearId"]
isOneToOne: false
      referencedRelation: "academicYears"
      referencedColumns: ["id"]
    }
                  ]
                },"examSubjects": {
                  Row: {
                    "academicYearId": string,"classId": string,"createdAt": string,"examDate": string | null,"examId": string,"id": string,"maxMarks": number,"passMarks": number | null,"subjectId": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academicYearId": string,"classId": string,"createdAt"?: string,"examDate"?: string | null,"examId": string,"id"?: string,"maxMarks": number,"passMarks"?: number | null,"subjectId": string,"updatedAt"?: string
                  }
                  Update: {
                    "academicYearId"?: string,"classId"?: string,"createdAt"?: string,"examDate"?: string | null,"examId"?: string,"id"?: string,"maxMarks"?: number,"passMarks"?: number | null,"subjectId"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "examSubjects_subjectId_fkey"
      columns: ["subjectId"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "examSubjectsClassFkey"
      columns: ["classId","academicYearId"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id","academicYearId"]
    },{
      foreignKeyName: "examSubjectsExamFkey"
      columns: ["examId","academicYearId"]
isOneToOne: false
      referencedRelation: "exams"
      referencedColumns: ["id","academicYearId"]
    }
                  ]
                },"noticeAudiences": {
                  Row: {
                    "audienceRole": Database["public"]['Enums']["userRole"] | null,"classId": string | null,"createdAt": string,"id": string,"noticeId": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audienceRole"?: Database["public"]['Enums']["userRole"] | null,"classId"?: string | null,"createdAt"?: string,"id"?: string,"noticeId": string
                  }
                  Update: {
                    "audienceRole"?: Database["public"]['Enums']["userRole"] | null,"classId"?: string | null,"createdAt"?: string,"id"?: string,"noticeId"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "noticeAudiences_classId_fkey"
      columns: ["classId"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "noticeAudiences_noticeId_fkey"
      columns: ["noticeId"]
isOneToOne: false
      referencedRelation: "notices"
      referencedColumns: ["id"]
    }
                  ]
                },"notices": {
                  Row: {
                    "body": string,"category": string | null,"createdAt": string,"createdByUserId": string,"id": string,"publishedAt": string | null,"status": Database["public"]['Enums']["noticeStatus"],"title": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"category"?: string | null,"createdAt"?: string,"createdByUserId": string,"id"?: string,"publishedAt"?: string | null,"status"?: Database["public"]['Enums']["noticeStatus"],"title": string,"updatedAt"?: string
                  }
                  Update: {
                    "body"?: string,"category"?: string | null,"createdAt"?: string,"createdByUserId"?: string,"id"?: string,"publishedAt"?: string | null,"status"?: Database["public"]['Enums']["noticeStatus"],"title"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notices_createdByUserId_fkey"
      columns: ["createdByUserId"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"results": {
                  Row: {
                    "classId": string,"createdAt": string,"enteredByUserId": string,"examSubjectId": string,"id": string,"marksObtained": number,"remarks": string | null,"studentId": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classId": string,"createdAt"?: string,"enteredByUserId": string,"examSubjectId": string,"id"?: string,"marksObtained": number,"remarks"?: string | null,"studentId": string,"updatedAt"?: string
                  }
                  Update: {
                    "classId"?: string,"createdAt"?: string,"enteredByUserId"?: string,"examSubjectId"?: string,"id"?: string,"marksObtained"?: number,"remarks"?: string | null,"studentId"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "results_enteredByUserId_fkey"
      columns: ["enteredByUserId"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resultsEnrollmentFkey"
      columns: ["studentId","classId"]
isOneToOne: false
      referencedRelation: "studentEnrollments"
      referencedColumns: ["studentId","classId"]
    },{
      foreignKeyName: "resultsExamSubjectFkey"
      columns: ["examSubjectId","classId"]
isOneToOne: false
      referencedRelation: "examSubjects"
      referencedColumns: ["id","classId"]
    }
                  ]
                },"studentAttendance": {
                  Row: {
                    "attendanceDate": string,"classId": string,"createdAt": string,"id": string,"markedByUserId": string,"remarks": string | null,"status": Database["public"]['Enums']["attendanceStatus"],"studentId": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendanceDate": string,"classId": string,"createdAt"?: string,"id"?: string,"markedByUserId": string,"remarks"?: string | null,"status": Database["public"]['Enums']["attendanceStatus"],"studentId": string,"updatedAt"?: string
                  }
                  Update: {
                    "attendanceDate"?: string,"classId"?: string,"createdAt"?: string,"id"?: string,"markedByUserId"?: string,"remarks"?: string | null,"status"?: Database["public"]['Enums']["attendanceStatus"],"studentId"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "studentAttendance_markedByUserId_fkey"
      columns: ["markedByUserId"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "studentAttendanceEnrollmentFkey"
      columns: ["studentId","classId"]
isOneToOne: false
      referencedRelation: "studentEnrollments"
      referencedColumns: ["studentId","classId"]
    }
                  ]
                },"studentEnrollments": {
                  Row: {
                    "academicYearId": string,"classId": string,"createdAt": string,"enrolledOn": string,"id": string,"rollNumber": number | null,"studentId": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academicYearId": string,"classId": string,"createdAt"?: string,"enrolledOn"?: string,"id"?: string,"rollNumber"?: number | null,"studentId": string,"updatedAt"?: string
                  }
                  Update: {
                    "academicYearId"?: string,"classId"?: string,"createdAt"?: string,"enrolledOn"?: string,"id"?: string,"rollNumber"?: number | null,"studentId"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "studentEnrollments_studentId_fkey"
      columns: ["studentId"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "studentEnrollmentsClassFkey"
      columns: ["classId","academicYearId"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id","academicYearId"]
    }
                  ]
                },"students": {
                  Row: {
                    "address": string | null,"admissionDate": string | null,"admissionNumber": string,"bloodGroup": string | null,"createdAt": string,"dateOfBirth": string | null,"fatherName": string | null,"gender": string | null,"id": string,"motherName": string | null,"role": Database["public"]['Enums']["userRole"],"updatedAt": string,"userId": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"admissionDate"?: string | null,"admissionNumber": string,"bloodGroup"?: string | null,"createdAt"?: string,"dateOfBirth"?: string | null,"fatherName"?: string | null,"gender"?: string | null,"id"?: string,"motherName"?: string | null,"role"?: Database["public"]['Enums']["userRole"],"updatedAt"?: string,"userId": string
                  }
                  Update: {
                    "address"?: string | null,"admissionDate"?: string | null,"admissionNumber"?: string,"bloodGroup"?: string | null,"createdAt"?: string,"dateOfBirth"?: string | null,"fatherName"?: string | null,"gender"?: string | null,"id"?: string,"motherName"?: string | null,"role"?: Database["public"]['Enums']["userRole"],"updatedAt"?: string,"userId"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "studentsUserFkey"
      columns: ["userId","role"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","role"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "code": string,"createdAt": string,"description": string | null,"id": string,"name": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"createdAt"?: string,"description"?: string | null,"id"?: string,"name": string,"updatedAt"?: string
                  }
                  Update: {
                    "code"?: string,"createdAt"?: string,"description"?: string | null,"id"?: string,"name"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    
                  ]
                },"teacherAssignments": {
                  Row: {
                    "classId": string,"createdAt": string,"id": string,"subjectId": string,"teacherId": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classId": string,"createdAt"?: string,"id"?: string,"subjectId": string,"teacherId": string,"updatedAt"?: string
                  }
                  Update: {
                    "classId"?: string,"createdAt"?: string,"id"?: string,"subjectId"?: string,"teacherId"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacherAssignments_classId_fkey"
      columns: ["classId"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacherAssignments_subjectId_fkey"
      columns: ["subjectId"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacherAssignments_teacherId_fkey"
      columns: ["teacherId"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"teacherAttendance": {
                  Row: {
                    "attendanceDate": string,"createdAt": string,"id": string,"markedByUserId": string,"remarks": string | null,"status": Database["public"]['Enums']["attendanceStatus"],"teacherId": string,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendanceDate": string,"createdAt"?: string,"id"?: string,"markedByUserId": string,"remarks"?: string | null,"status": Database["public"]['Enums']["attendanceStatus"],"teacherId": string,"updatedAt"?: string
                  }
                  Update: {
                    "attendanceDate"?: string,"createdAt"?: string,"id"?: string,"markedByUserId"?: string,"remarks"?: string | null,"status"?: Database["public"]['Enums']["attendanceStatus"],"teacherId"?: string,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacherAttendance_markedByUserId_fkey"
      columns: ["markedByUserId"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacherAttendance_teacherId_fkey"
      columns: ["teacherId"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"teachers": {
                  Row: {
                    "createdAt": string,"dateOfJoining": string | null,"employeeCode": string,"id": string,"qualification": string | null,"role": Database["public"]['Enums']["userRole"],"updatedAt": string,"userId": string
                  }
                  ComputedFields: never
                  Insert: {
                    "createdAt"?: string,"dateOfJoining"?: string | null,"employeeCode": string,"id"?: string,"qualification"?: string | null,"role"?: Database["public"]['Enums']["userRole"],"updatedAt"?: string,"userId": string
                  }
                  Update: {
                    "createdAt"?: string,"dateOfJoining"?: string | null,"employeeCode"?: string,"id"?: string,"qualification"?: string | null,"role"?: Database["public"]['Enums']["userRole"],"updatedAt"?: string,"userId"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teachersUserFkey"
      columns: ["userId","role"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","role"]
    }
                  ]
                },"timetableEntries": {
                  Row: {
                    "academicYearId": string,"classId": string,"createdAt": string,"dayOfWeek": number,"endTime": string,"id": string,"room": string | null,"startTime": string,"subjectId": string,"teacherId": string | null,"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academicYearId": string,"classId": string,"createdAt"?: string,"dayOfWeek": number,"endTime": string,"id"?: string,"room"?: string | null,"startTime": string,"subjectId": string,"teacherId"?: string | null,"updatedAt"?: string
                  }
                  Update: {
                    "academicYearId"?: string,"classId"?: string,"createdAt"?: string,"dayOfWeek"?: number,"endTime"?: string,"id"?: string,"room"?: string | null,"startTime"?: string,"subjectId"?: string,"teacherId"?: string | null,"updatedAt"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "timetableEntries_classId_fkey"
      columns: ["classId"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timetableEntries_subjectId_fkey"
      columns: ["subjectId"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timetableEntries_teacherId_fkey"
      columns: ["teacherId"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timetableEntriesAssignmentFkey"
      columns: ["teacherId","classId","subjectId"]
isOneToOne: false
      referencedRelation: "teacherAssignments"
      referencedColumns: ["teacherId","classId","subjectId"]
    },{
      foreignKeyName: "timetableEntriesClassYearFkey"
      columns: ["classId","academicYearId"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id","academicYearId"]
    }
                  ]
                },"users": {
                  Row: {
                    "authUserId": string,"createdAt": string,"deactivatedAt": string | null,"email": string,"fullName": string,"id": string,"isActive": boolean,"phone": string | null,"role": Database["public"]['Enums']["userRole"],"updatedAt": string
                  }
                  ComputedFields: never
                  Insert: {
                    "authUserId": string,"createdAt"?: string,"deactivatedAt"?: string | null,"email": string,"fullName": string,"id"?: string,"isActive"?: boolean,"phone"?: string | null,"role": Database["public"]['Enums']["userRole"],"updatedAt"?: string
                  }
                  Update: {
                    "authUserId"?: string,"createdAt"?: string,"deactivatedAt"?: string | null,"email"?: string,"fullName"?: string,"id"?: string,"isActive"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["userRole"],"updatedAt"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "createNotice":
{ Args: { "audiences": Json,"body": string,"category": string,"title": string }; Returns: string
                           },
"findAuthUserIdByEmail":
{ Args: { "email": string }; Returns: string
                           },
"provisionAppUser":
{ Args: { "actorUserId"?: string,"authUserId": string,"email": string,"fullName": string,"profile"?: Json,"role": Database["public"]['Enums']["userRole"] }; Returns: string
                           },
"publishNotice":
{ Args: { "noticeId": string }; Returns: undefined
                           },
"setAppUserStatus":
{ Args: { "actorUserId": string,"isActive": boolean,"userId": string }; Returns: Json
                           },
"setCurrentAcademicYear":
{ Args: { "academicYearId": string }; Returns: undefined
                           },
"setNoticeAudiences":
{ Args: { "audiences": Json,"noticeId": string }; Returns: undefined
                           },
"updateStudentProfile":
{ Args: { "profilePatch"?: Json,"studentId": string,"userPatch"?: Json }; Returns: undefined
                           },
"updateTeacherProfile":
{ Args: { "profilePatch"?: Json,"teacherId": string,"userPatch"?: Json }; Returns: undefined
                           }
          }
          Enums: {
            "attendanceStatus": "present"|"absent"|"late"|"leave","noticeStatus": "draft"|"published"|"archived","userRole": "admin"|"teacher"|"student"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "attendanceStatus": ["present", "absent", "late", "leave"],"noticeStatus": ["draft", "published", "archived"],"userRole": ["admin", "teacher", "student"]
          }
        }
} as const
