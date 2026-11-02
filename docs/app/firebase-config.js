// ใส่ค่า config จาก Firebase Console (Project settings → Your apps → Web app)
// ค่านี้เปิดเผยได้ตามปกติ ความปลอดภัยมาจาก Authentication และ firestore.rules ไม่ใช่การซ่อนค่านี้
// ถ้ายังเป็น YOUR_... แอปจะรันในโหมดสาธิต (ข้อมูลอยู่ในหน่วยความจำ ไม่มีความปลอดภัยจริง)
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID",
};
