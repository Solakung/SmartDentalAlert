# line-notifier (ต้นแบบ แจ้งเตือนทาง LINE)

Vercel serverless functions สำหรับส่งข้อความ 3 กลุ่ม: ผู้ป่วย, อสม./ผู้ดูแล, เจ้าหน้าที่
**ค่าเริ่มต้นเป็น `dryrun` ไม่ส่งข้อความจริง** ใช้ได้ทันทีโดยไม่ต้องมี LINE token

| SEND_MODE | พฤติกรรม |
|---|---|
| `dryrun` | คืนรายการข้อความที่จะส่ง ไม่เรียก LINE |
| `staff_only` | ส่งจริงเฉพาะ `STAFF_USER_IDS` (บุคลากรทดลองใช้) ข้ามผู้ป่วย/ผู้ดูแล |
| `live` | ส่งหาผู้ป่วย/ผู้ดูแลได้ **ต่อเมื่อ** `ALLOW_PATIENT_MESSAGES=true` ด้วย |

> ใช้นัดสมมติและรหัสวิจัยเท่านั้น ห้ามส่งข้อมูล JHCIS จริงจนกว่าจะผ่านจริยธรรมและได้รับความยินยอม
> ห้ามนำ token/secret ใส่ใน repo เก็บใน Environment Variables ของ Vercel (ดู `.env.example`)

ทดสอบในเครื่อง: `node test-dryrun.js`
