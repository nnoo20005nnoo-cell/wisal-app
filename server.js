const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات السحابية
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("✅ تم الاتصال بنجاح بقاعدة البيانات السحابية (MongoDB)");
}).catch(err => {
    console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err);
});

// نموذج التأشيرات في القاعدة
const VisaSchema = new mongoose.Schema({
    clientName: String,
    passportNo: String,
    issueDate: String,
    durationDays: Number,
    expiryDate: String,
    notifyDate: String
});
const Visa = mongoose.model('Visa', VisaSchema);

// جلب جميع التأشيرات (لتظهر متزامنة بين الجوال واللابتوب)
app.get('/api/visas', async (req, res) => {
    try {
        const visas = await Visa.find().sort({ _id: -1 });
        res.json(visas);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

// إضافة تأشيرة جديدة وحفظها سحابياً
app.post('/api/visas', async (req, res) => {
    try {
        const { clientName, passportNo, issueDate, durationDays } = req.body;
        
        // حساب تاريخ الانتهاء وتاريخ التنبيه تلقائياً
        const issue = new Date(issueDate);
        const expiry = new Date(issue);
        expiry.setDate(expiry.getDate() + parseInt(durationDays));
        
        const notify = new Date(expiry);
        notify.setDate(notify.getDate() - 5);

        const newVisa = new Visa({
            clientName,
            passportNo,
            issueDate,
            durationDays,
            expiryDate: expiry.toISOString().split('T')[0],
            notifyDate: notify.toISOString().split('T')[0]
        });

        await newVisa.save();
        res.json({ success: true, visa: newVisa });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في حفظ البيانات' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 النظام أونلاين بنجاح على المنفذ: ${PORT}`);
});