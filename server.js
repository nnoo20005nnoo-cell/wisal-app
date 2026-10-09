require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const webPush = require('web-push');
const cron = require('node-cron');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// الاتصال بقاعدة البيانات السحابية (MongoDB Atlas)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wisalApp';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بنجاح بقاعدة البيانات السحابية (MongoDB)'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// هيكل قواعد البيانات الموحدة
const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  expiryDate: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const subscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  keys: Object,
  createdAt: { type: Date, default: Date.now }
});

const Client = mongoose.model('Client', clientSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);

// إعداد VAPID للإشعارات
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY.replace(/^["']|["']$/g, '').trim(),
      process.env.VAPID_PRIVATE_KEY.replace(/^["']|["']$/g, '').trim()
    );
  } catch (e) {}
}

// APIs
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في جلب العملاء' });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { name, expiryDate } = req.body;
    if (!name || !expiryDate) return res.status(400).json({ error: 'بيانات غير مكتملة' });
    const newClient = await Client.create({ name, expiryDate });
    res.status(201).json(newClient);
  } catch (e) {
    res.status(500).json({ error: 'فشل حفظ العميل' });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'فشل حذف العميل' });
  }
});

app.get('/api/qr-code', async (req, res) => {
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const currentUrl = `${protocol}://${host}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(currentUrl);
    res.json({ qrCode: qrDataUrl, url: currentUrl });
  } catch (err) {
    res.status(500).json({ error: 'فشل إنشاء الباركود' });
  }
});

app.get('/api/vapid-key', (req, res) => {
  res.json({ publicKey: (process.env.VAPID_PUBLIC_KEY || '').replace(/^["']|["']$/g, '').trim() });
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const sub = req.body;
    await Subscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      sub,
      { upsert: true, new: true }
    );
    res.status(201).json({ message: 'تم الاشتراك بنجاح' });
  } catch (e) {
    res.status(500).json({ error: 'فشل الاشتراك' });
  }
});

app.post('/api/test-notification', async (req, res) => {
  try {
    const subs = await Subscription.find();
    const payload = JSON.stringify({ 
      title: 'الوصال 🔔', 
      body: 'تنبيه أونلاين: تم ربط هذا الجوال بالنظام السحابي بنجاح!' 
    });
    
    let sentCount = 0;
    for (const sub of subs) {
      try {
        await webPush.sendNotification(sub, payload);
        sentCount++;
      } catch (err) {}
    }
    res.json({ success: true, count: sentCount });
  } catch (e) {
    res.status(500).json({ error: 'فشل الإرسال' });
  }
});

// فحص أوتوماتيكي يومي 9 صباحاً
cron.schedule('0 9 * * *', async () => {
  try {
    const clients = await Client.find();
    const subs = await Subscription.find();
    const today = new Date();

    const expiring = clients.filter(c => {
      const exp = new Date(c.expiryDate);
      const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 5;
    });

    if (expiring.length > 0 && subs.length > 0) {
      const payload = JSON.stringify({
        title: 'تنبيه انتهاء تأشيرات ⚠️',
        body: `يوجد ${expiring.length} تأشيرة تنتهي خلال أقل من 5 أيام!`
      });
      subs.forEach(sub => webPush.sendNotification(sub, payload).catch(() => {}));
    }
  } catch (e) {}
});

app.listen(PORT, () => {
  console.log(`🚀 النظام أونلاين بنجاح على المنفذ: ${PORT}`);
});