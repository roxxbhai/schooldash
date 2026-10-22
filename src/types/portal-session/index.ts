export interface PortalSessionStore {
  /**
   * THE SIGNED-IN PERSON'S OWN RECORD ID, RESOLVED ON THE SERVER BY <PortalGate>:
   * `teachers.id` IN THE TEACHER PORTAL, `students.id` IN THE STUDENT PORTAL, NULL
   * IN THE ADMIN PORTAL AND UNTIL THE PORTAL HAS MOUNTED.
   */
  recordId: string | null;
  /** THE SIGNED-IN PERSON'S NAME, FOR GREETINGS. NULL UNTIL THE PORTAL HAS MOUNTED. */
  fullName: string | null;
  setRecordId: (recordId: string | null) => void;
  setFullName: (fullName: string | null) => void;
}
