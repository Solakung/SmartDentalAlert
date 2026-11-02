# ตั้งค่าแดชบอร์ดเว็บ (Firebase)

> ขอบเขต: ส่วนนี้เกินกว่าขอบเขตโครงร่าง (1.7) ใช้ `docs/index.html` (mock-up) สำหรับสอบโครงร่าง
> ใช้แอปนี้หลังปรึกษาอาจารย์ที่ปรึกษา/คณะกรรมการจริยธรรม เก็บเฉพาะรหัสวิจัย (P0123) และคะแนนความเสี่ยงบนคลาวด์

1. https://console.firebase.google.com → Add project
2. Build → Authentication → Sign-in method → เปิด **Email/Password** (ไม่มีหน้าสมัครเองในแอป)
3. Build → Firestore Database → Create (เลือก region เช่น asia-southeast1) → แท็บ Rules วางเนื้อหา `firestore.rules` แล้ว Publish
4. Authentication → Users → Add user สร้างบัญชีแอดมินและเจ้าหน้าที่
5. Firestore → สร้าง collection `users` → เอกสาร ID = UID ของผู้ใช้ → ฟิลด์ `role` (string) = `admin` หรือ `staff`
   (ถ้าไม่ทราบ UID ให้ล็อกอินก่อน หน้าจอ "ยังไม่ได้รับสิทธิ์" จะแสดง UID ให้)
6. Project settings → Your apps → Web (`</>`) คัดลอก config ใส่ `docs/app/firebase-config.js` แล้ว commit
7. Authentication → Settings → Authorized domains เพิ่ม `solakung.github.io`
8. เปิดที่ https://solakung.github.io/SmartDentalAlert/app/

ใช้งาน: แอดมินอัปโหลด `scored_for_import.csv` จาก `score_new.py` ที่แท็บนำเข้า เจ้าหน้าที่เห็นคิวและบันทึกผลมา/ขาดนัดได้เท่านั้น
