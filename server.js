require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wisalDB';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected successfully to MongoDB Atlas'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

const visaSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    passportNumber: { type: String, required: true },
    clientPhone: { type: String, default: '' },
    hostPhone: { type: String, default: '' },
    agencyReply: { type: String, default: '' },
    issueDate: { type: String, required: true },
    durationDays: { type: Number, required: true, default: 90 },
    expiryDate: { type: String, required: true },
    alertDate: { type: String, required: true },
    status: { type: String, default: 'نشطة' }
}, { timestamps: true });

const Visa = mongoose.model('Visa', visaSchema);

io.on('connection', (socket) => {
    console.log('⚡ A user connected to WebSocket:', socket.id);
    checkAndSendAlerts();

    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
    });
});

function calculateStatus(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expiryDateStr);
    expDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'منتهية';
    if (diffDays <= 5) return 'قريبة من الانتهاء';
    return 'نشطة';
}

async function checkAndSendAlerts() {
    try {
        const visas = await Visa.find();
        let warningVisas = [];
        let expiredVisas = [];

        for (let v of visas) {
            const currentStatus = calculateStatus(v.expiryDate);
            if (v.status !== currentStatus) {
                v.status = currentStatus;
                await v.save();
            }

            if (currentStatus === 'قريبة من الانتهاء') warningVisas.push(v);
            if (currentStatus === 'منتهية') expiredVisas.push(v);
        }

        if (warningVisas.length > 0 || expiredVisas.length > 0) {
            io.emit('dailyAlertNotification', {
                warningCount: warningVisas.length,
                expiredCount: expiredVisas.length,
                message: `⚠️ تنبيه تلقائي: يوجد ${warningVisas.length} تأشيرة قريبة من الانتهاء!`
            });
        }
    } catch (err) {
        console.error('❌ خطأ في فحص التنبيهات التلقائية:', err);
    }
}

setInterval(() => {
    checkAndSendAlerts();
}, 12 * 60 * 60 * 1000);

app.get('/api/visas', async (req, res) => {
    try {
        const visas = await Visa.find().sort({ createdAt: -1 });
        const updatedVisas = [];
        for (let v of visas) {
            const currentStatus = calculateStatus(v.expiryDate);
            if (v.status !== currentStatus) {
                v.status = currentStatus;
                await v.save();
            }
            updatedVisas.push(v);
        }
        res.json(updatedVisas);
    } catch (error) {
        console.error('Error fetching visas:', error);
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

app.post('/api/visas', async (req, res) => {
    try {
        const { 
            clientName, passportNumber, issueDate, durationDays, expiryDate, alertDate,
            clientPhone, hostPhone, agencyReply 
        } = req.body;
        
        const status = calculateStatus(expiryDate);

        const newVisa = new Visa({
            clientName,
            passportNumber,
            clientPhone: clientPhone || '',
            hostPhone: hostPhone || '',
            agencyReply: agencyReply || '',
            issueDate,
            durationDays: parseInt(durationDays) || 90,
            expiryDate,
            alertDate,
            status
        });

        await newVisa.save();
        io.emit('visaAdded', newVisa);
        checkAndSendAlerts();

        res.status(201).json(newVisa);
    } catch (error) {
        console.error('Error adding visa:', error);
        res.status(500).json({ error: 'خطأ في حفظ بيانات التأشيرة' });
    }
});

app.delete('/api/visas/:id', async (req, res) => {
    try {
        const deletedVisa = await Visa.findByIdAndDelete(req.params.id);
        if (!deletedVisa) {
            return res.status(404).json({ error: 'التأشيرة غير موجودة' });
        }
        io.emit('visaDeleted', req.params.id);
        res.json({ message: 'تم حذف التأشيرة بنجاح', id: req.params.id });
    } catch (error) {
        console.error('Error deleting visa:', error);
        res.status(500).json({ error: 'خطأ في حذف التأشيرة' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 WisalApp Server listening on port ${PORT}`);
    checkAndSendAlerts();
});