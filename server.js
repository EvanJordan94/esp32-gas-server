const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment-timezone');
const WebSocket = require('ws'); // Thêm thư viện WebSocket

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Schema và Model
const GasSchema = new mongoose.Schema({
    gas: Number,
    distance: Number,
    connectionCount: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});
const GasData = mongoose.model('GasData', GasSchema);

const StatusSchema = new mongoose.Schema({
    isConnected: Boolean,
    connectionCount: Number,
    updatedAt: { type: Date, default: Date.now }
});
const Esp32Status = mongoose.model('Esp32Status', StatusSchema);

const ThresholdSchema = new mongoose.Schema({
    threshold: Number,
    updatedAt: { type: Date, default: Date.now }
});
const Threshold = mongoose.model('Threshold', ThresholdSchema);
const Threshold = mongoose.model('Threshold', ThresholdSchema);

// Biến lưu trữ kết nối WebSocket với ESP32

let esp32WebSocket = null;
let buzzerState = 'OFF'; // Trạng thái còi
// Khởi tạo WebSocket server
const wss = new WebSocket.Server({ port: 8081 }); // Port websocket server

wss.on('connection', ws => {
    console.log('ESP32 connected via WebSocket');
    esp32WebSocket = ws; // Lưu trữ kết nối

    ws.on('close', () => {
        console.log('ESP32 disconnected via WebSocket');
        esp32WebSocket = null; // Xóa kết nối khi ngắt kết nối
    });

    ws.on('message', message => {
        console.log(`Received from ESP32: ${message}`);
        // Xử lý tin nhắn từ ESP32 nếu cần
    });
    // Hàm gửi lệnh đến ESP32
    function sendCommand(command) {
      if (esp32WebSocket) {
          esp32WebSocket.send(JSON.stringify({ command }));
      } else {
          console.error('ESP32 not connected');
      }
  }

  // Gửi trạng thái còi hiện tại khi ESP32 kết nối
  sendCommand(buzzerState);
});

// API: ESP32 gửi dữ liệu
app.post('/api/gas', async (req, res) => {
    const { gas, distance } = req.body;
    console.log("Dữ liệu nhận được từ ESP32:", req.body);
    try {
        const newData = new GasData({ gas, distance });
        await newData.save();
        res.status(200).json({ message: 'Saved' });
    } catch (err) {
        console.error("Lỗi lưu dữ liệu:", err);
        res.status(500).json({ error: 'Save failed' });
    }
});

// API: App Android lấy tất cả lịch sử
app.get('/api/gas', async (req, res) => {
    const data = await GasData.find().sort({ timestamp: -1 });
    res.json(data);
});

// API: Lọc dữ liệu theo thời gian
app.get('/api/gas/range', async (req, res) => {
    const { from, to } = req.query;
    const fromDate = moment.tz(from, "Asia/Ho_Chi_Minh").toDate();
    const toDate = moment.tz(to, "Asia/Ho_Chi_Minh").toDate();

    try {
        const filteredData = await GasData.find({
            timestamp: { $gte: fromDate, $lte: toDate }
        }).sort({ timestamp: 1 });

        res.json(filteredData);
    } catch (err) {
        console.error("Lỗi khi lọc dữ liệu:", err);
        res.status(500).json({ error: 'Lỗi khi lọc dữ liệu' });
    }
});

// API điều khiển còi thủ công từ Android (Sử dụng WebSocket)
app.post('/api/buzzer/manual', (req, res) => {
    const { action } = req.body;
    if (esp32WebSocket) {
        esp32WebSocket.send(JSON.stringify({ command: action }));
        res.json({ message: 'Lệnh đã được gửi' });
    } else {
        res.status(500).json({ message: 'ESP32 không kết nối' });
    }
});

// API nhận trạng thái còi từ ESP32
app.post('/api/buzzer/status', (req, res) => {
    const { status } = req.body;
    res.json({ message: 'Trạng thái còi đã được cập nhật' });
});

// API điều khiển còi tự động
app.post('/api/buzzer/auto', (req, res) => {
    const { action } = req.body;
    if (esp32WebSocket) {
        esp32WebSocket.send(JSON.stringify({ command: action }));
        res.json({ message: 'Lệnh đã được gửi' });
    } else {
        res.status(500).json({ message: 'ESP32 không kết nối' });
    }
});

// API kiểm tra trạng thái kết nối ESP32
app.get('/api/esp32/status', async (req, res) => {
    try {
        const status = await Esp32Status.findOne();
        console.log("Trạng thái kết nối ESP32:", status);

        if (!status) {
            return res.json({ status: 'disconnected' });
        }

        res.json({
            status: status.isConnected ? 'connected' : 'disconnected',
        });
    } catch (err) {
        console.error("Lỗi khi lấy trạng thái kết nối ESP32:", err);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// API ESP32 kết nối lại (Khi app bật switch)
app.post('/api/esp32/connect', async (req, res) => {
    try {
        let status = await Esp32Status.findOne();
        if (!status) {
            status = new Esp32Status({ isConnected: true, connectionCount: 1 });
        } else {
            if (!status.isConnected) {
                status.isConnected = true;
            } else {
                return res.status(200).json({ message: 'ESP32 already connected' });
            }
        }
        status.updatedAt = new Date();
        await status.save();
        console.log(`ESP32 Connected: connectionCount ${status.connectionCount}`);
        res.status(200).json({ message: 'ESP32 connected' });
    } catch (err) {
        console.error("Error while connecting ESP32:", err);
        res.status(500).json({ error: 'Failed to connect ESP32' });
    }
});

// API ESP32 ngắt kết nối (Khi app tắt switch)
app.post('/api/esp32/disconnect', async (req, res) => {
    try {
        let status = await Esp32Status.findOne();
        if (!status) {
            status = new Esp32Status({ isConnected: false });
        } else {
            if (status.isConnected) {
                status.isConnected = false;
                status.updatedAt = new Date();
                await status.save();
                return res.status(200).json({ message: 'ESP32 disconnected' });
            } else {
                return res.status(200).json({ message: 'ESP32 already disconnected' });
            }
        }
        res.status(200).json({ message: 'ESP32 disconnected' });
    } catch (err) {
        console.error("Error while disconnecting ESP32:", err);
        res.status(500).json({ error: 'Failed to disconnect ESP32' });
    }
});
// API điều khiển còi thủ công từ Android
app.post('/api/buzzer/manual', (req, res) => {
  const { action } = req.body;
  buzzerState = action; // Cập nhật trạng thái còi
  if (esp32WebSocket) {
      esp32WebSocket.send(JSON.stringify({ command: action }));
      res.json({ message: 'Lệnh đã được gửi' });
  } else {
      res.status(500).json({ message: 'ESP32 không kết nối' });
  }
});

// ✅ Khởi động server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));

