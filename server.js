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

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wisalDB';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected successfully to MongoDB Atlas'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Mongoose Schema & Model
const visaSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    passportNumber: { type: String, required: true },
    issueDate: { type: String, required: true },
    durationDays: { type: Number, required: true, default: 90 },
    expiryDate: { type: String, required: true },
    alertDate: { type: String, required: true },
    status: { type: String, default: 'نشطة' }
}, { timestamps: true });

const Visa = mongoose.model('Visa', visaSchema);

// Socket.io Real-time connection
io.on('connection', (socket) => {
    console.log('⚡ A user connected to WebSocket:', socket.id);
    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
    });
});

// Helper function to update status
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

// API Routes
// 1. Get all visas
app.get('/api/visas', async (req, res) => {
    try {
        const visas = await Visa.find().sort({ createdAt: -1 });
        const updatedVisas = visas.map(v => {
            const currentStatus = calculateStatus(v.expiryDate);
            if (v.status !== currentStatus) {
                v.status = currentStatus;
            }
            return v;
        });
        res.json(updatedVisas);
    } catch (error) {
        console.error('Error fetching visas:', error);
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

// 2. Add new visa
app.post('/api/visas', async (req, res) => {
    try {
        const { clientName, passportNumber, issueDate, durationDays, expiryDate, alertDate } = req.body;
        const status = calculateStatus(expiryDate);

        const newVisa = new Visa({
            clientName,
            passportNumber,
            issueDate,
            durationDays: parseInt(durationDays) || 90,
            expiryDate,
            alertDate,
            status
        });

        await newVisa.save();

        // Broadcast to all clients
        io.emit('visaAdded', newVisa);

        res.status(201).json(newVisa);
    } catch (error) {
        console.error('Error adding visa:', error);
        res.status(500).json({ error: 'خطأ في حفظ بيانات التأشيرة' });
    }
});

// 3. Delete visa
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

// Serve frontend SPA fallback safely
app.get('(.*)', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 WisalApp Server listening on port ${PORT}`);
});