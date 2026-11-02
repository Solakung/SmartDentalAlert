# SmartDentalAlert

ต้นแบบโมเดลพยากรณ์การขาดนัดบริการทันตกรรมของผู้สูงอายุ (Random Forest, กรอบแนวคิด Andersen)
ประกอบโครงร่างวิทยานิพนธ์ สาธารณสุขศาสตรมหาบัณฑิต วิทยาลัยการสาธารณสุขสิรินธร จังหวัดชลบุรี

> **ข้อมูลใน repo นี้เป็นข้อมูลจำลองทั้งหมด** ตัวเลขประสิทธิภาพเป็นเพียงผลทดสอบขั้นตอน ไม่ใช่ผลการวิจัย
> **ห้ามนำข้อมูลผู้ป่วยจริงขึ้น repo นี้** (repo เป็นสาธารณะ)

## ภาพจำลองระบบ (mock-up)
`docs/index.html` แยกเป็น 2 มุมมอง (สลับที่มุมขวาบน เป็นการสาธิต ไม่มีล็อกอินจริง)
- **เจ้าหน้าที่:** คิวนัดหมายแยกระดับเสี่ยง 3 สี (แดง/เหลือง/เขียว) มาตรการติดตามที่ติ๊กได้ และบันทึกผลมา/ขาดนัด
- **แอดมิน:** เพิ่มนัดทีละราย นำเข้า CSV (ตรวจรหัสผู้ป่วยไม่ให้เป็นชื่อ) ปรับจุดตัดความเสี่ยง ดูตัวชี้วัดโมเดลและผลที่บันทึก

แท็บ **ข้อความ LINE** แสดงตัวอย่างข้อความ 3 กลุ่มผู้รับ (ยังไม่ส่งจริง)

ข้อมูลที่เพิ่ม/บันทึกเก็บในเบราว์เซอร์เครื่องนั้นเท่านั้น

## ต้นแบบแจ้งเตือน LINE
โฟลเดอร์ `line-notifier/` เป็นฟังก์ชันบน Vercel ค่าเริ่มต้น dry-run (ไม่ส่งจริง) ดู `line-notifier/README.md`
เปิดผ่าน GitHub Pages: Settings → Pages → Branch `main` โฟลเดอร์ `/docs`

## วิธีรัน
```
pip install numpy pandas scikit-learn joblib
python3 generate_data.py     # สร้าง synthetic_appointments.csv
python3 train_model.py       # ฝึก/ประเมินโมเดล -> results.json, feature_importance.csv, test_predictions.csv
python3 build_mockup.py      # สร้าง docs/index.html จากผลลัพธ์
```
ใช้ข้อมูลจริงโดยส่งออกจาก JHCIS เป็น CSV ที่มีชื่อคอลัมน์เดียวกับ `synthetic_appointments.csv` แล้วรัน `python3 train_model.py ไฟล์.csv`
(เก็บไว้ในโฟลเดอร์ `data_real/` ซึ่งถูก ignore) ตัวแปรเริ่มต้นตามภาคผนวก ก ใช้ `FEATURESET=full` เพื่อวิเคราะห์ความไวด้วยตัวแปรเพิ่ม

## ขั้นตอนตามบทที่ 3
1. แบ่งข้อมูลตามเวลา: ฝึก 2566–67 (Validation = ครึ่งหลัง 2567), ทดสอบ 2568
2. SMOTE เฉพาะชุดฝึก แล้วฝึก Random Forest เทียบกับ class_weight และ Logistic regression
3. ตัวชี้วัด: Accuracy, Precision, Recall, F1, AUC, PR-AUC, Brier
4. ความสำคัญของตัวแปร: Gini และ Permutation จัดกลุ่มตาม Andersen
5. จุดตัดความเสี่ยง 3 ระดับจากชุด Validation

## ใช้กับหลายหน่วยบริการ
ชื่อหน่วยบริการตั้งได้ผ่านตัวแปร `FACILITY_NAME` (ทั้ง `line-notifier` และ `build_mockup.py`) ข้อมูลเตาถ่านใช้เป็นชุดฝึกของโมเดลเท่านั้น หน่วยบริการอื่นควรตรวจสอบประสิทธิภาพและฝึกโมเดลใหม่ด้วยข้อมูลของตัวเองก่อนใช้งาน

## ขั้นตอนใช้กับข้อมูลของแต่ละหน่วยบริการ (วิธีนำเข้าไฟล์)
1. ส่งออกประวัตินัดจาก JHCIS ตามแม่แบบ `templates/training_template.csv` (ใช้รหัสวิจัย ไม่มีชื่อ/เลขบัตร)
2. `python3 validate_csv.py ประวัติ.csv` ตรวจคอลัมน์ ช่วงค่า และคอลัมน์ที่อาจเป็นข้อมูลระบุตัวตน
3. `python3 train_model.py ประวัติ.csv` ฝึกโมเดลของหน่วยนั้นเอง (ไม่ใช้โมเดลข้ามหน่วย)
4. ส่งออกนัดล่วงหน้าตาม `templates/upcoming_template.csv` แล้วรัน
   `python3 score_new.py upcoming.csv --history ประวัติ.csv -o scored_for_import.csv`
   (`--history` คำนวณจำนวนนัดและการขาดนัดก่อนหน้าให้เอง)
5. นำ `scored_for_import.csv` เข้าหน้าแอดมิน แท็บ "นำเข้านัดหมาย" และตั้งจุดตัดให้ตรงกับที่สคริปต์แจ้ง

คอลัมน์ที่ต้องมี: `patient_id, appt_date, period, procedure, age, sex, marital, scheme, distance_km, chronic_disease, lead_days, prior_appts, prior_noshows` (+ `no_show` ในไฟล์ฝึก) ค่าที่ยอมรับของ period/sex/marital/scheme/procedure ดูใน `schema.py`
