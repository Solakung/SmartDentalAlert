# SmartDentalAlert

ต้นแบบโมเดลพยากรณ์การขาดนัดบริการทันตกรรมของผู้สูงอายุ (Random Forest, กรอบแนวคิด Andersen)
ประกอบโครงร่างวิทยานิพนธ์ สาธารณสุขศาสตรมหาบัณฑิต วิทยาลัยการสาธารณสุขสิรินธร จังหวัดชลบุรี

> **ข้อมูลใน repo นี้เป็นข้อมูลจำลองทั้งหมด** ตัวเลขประสิทธิภาพเป็นเพียงผลทดสอบขั้นตอน ไม่ใช่ผลการวิจัย
> **ห้ามนำข้อมูลผู้ป่วยจริงขึ้น repo นี้** (repo เป็นสาธารณะ)

## ภาพจำลองระบบ (mock-up)
`docs/index.html` คือหน้าคิวนัดหมายแยกระดับเสี่ยง 3 สี (แดง/เหลือง/เขียว) พร้อมมาตรการติดตามและความสำคัญของปัจจัย
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
