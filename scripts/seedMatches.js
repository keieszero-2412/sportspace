import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBvLJvPwSAZ2IoG0D_FkCTmwrSe6pJ91Zk",
  authDomain: "sportspace-af6b4.firebaseapp.com",
  projectId: "sportspace-af6b4",
  storageBucket: "sportspace-af6b4.firebasestorage.app",
  messagingSenderId: "490538912999",
  appId: "1:490538912999:web:ab64a9dd6d9e56f20ea642",
  measurementId: "G-R1VKP7KP24"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const mockUsers = [
  { id: 'user1', name: 'Nam Vũ', score: 100 },
  { id: 'user2', name: 'Hoàng Anh', score: 98 },
  { id: 'user3', name: 'Lê Minh', score: 95 },
  { id: 'user4', name: 'Trần Khoa', score: 92 },
  { id: 'user5', name: 'Phạm Hương', score: 99 },
];

const mockMatches = [
  {
    title: 'Giao lưu nhẹ Pickleball 2.5',
    sport: 'Pickleball',
    province: 'Hà Nội',
    venueName: 'Cầu Giấy Pickleball Arena',
    time: '18:30 - 20:00',
    date: 'Hôm nay',
    playersMax: 4,
    cost: '45.000đ/người',
    levelRequired: 'Phong trào (2.5 - 3.5)',
    playersJoined: 2,
    host: mockUsers[0]
  },
  {
    title: 'Đá bóng dưỡng sinh sân 7',
    sport: 'Bóng đá',
    province: 'Hà Nội',
    venueName: 'Sân bóng Hoàng Minh Giám',
    time: '20:00 - 21:30',
    date: 'Tối mai',
    playersMax: 14,
    cost: '50.000đ/người',
    levelRequired: 'Khá / Cọ xát',
    playersJoined: 11,
    host: mockUsers[1]
  },
  {
    title: 'Giao lưu cầu lông đôi nam nữ',
    sport: 'Cầu lông',
    province: 'Hồ Chí Minh',
    venueName: 'Sân cầu lông Viettel',
    time: '08:00 - 10:00',
    date: 'Chủ Nhật',
    playersMax: 4,
    cost: '60.000đ/người',
    levelRequired: 'Phong trào khá',
    playersJoined: 3,
    host: mockUsers[2]
  },
  {
    title: 'Tìm 2 người ghép đá sân 7 thiếu ST & CB',
    sport: 'Bóng đá',
    province: 'Hà Nội',
    venueName: 'Sân bóng Thủy Lợi',
    time: '19:00 - 20:30',
    date: 'Tối nay',
    playersMax: 14,
    cost: '40.000đ/người',
    levelRequired: 'Bán chuyên (3.5+)',
    playersJoined: 12,
    host: mockUsers[3]
  },
  {
    title: 'Pickleball Dinking & Drilling nâng cao',
    sport: 'Pickleball',
    province: 'Hồ Chí Minh',
    venueName: 'Sân Pickleball Tao Đàn',
    time: '17:30 - 19:30',
    date: 'Chiều nay',
    playersMax: 4,
    cost: '55.000đ/người',
    levelRequired: 'Bán chuyên (3.5+)',
    playersJoined: 2,
    host: mockUsers[4]
  },
  {
    title: 'Tìm bạn đánh đơn bóng bàn',
    sport: 'Bóng bàn',
    province: 'Hà Nội',
    venueName: 'CLB Bóng bàn Bách Khoa',
    time: '16:00 - 18:00',
    date: 'Thứ 7',
    playersMax: 2,
    cost: '20.000đ/người',
    levelRequired: 'Mọi trình độ (Vui là chính)',
    playersJoined: 1,
    host: mockUsers[0]
  },
  {
    title: 'Thiếu 2 người đấu bóng rổ 5x5 full sân',
    sport: 'Bóng rổ',
    province: 'Hồ Chí Minh',
    venueName: 'Sân bóng rổ Phú Thọ',
    time: '16:30 - 18:30',
    date: 'Chiều nay',
    playersMax: 10,
    cost: '30.000đ/người',
    levelRequired: 'Phong trào khá',
    playersJoined: 8,
    host: mockUsers[1]
  },
  {
    title: 'Giao lưu bóng chuyền da nam/nữ trần cao mát mẻ',
    sport: 'Bóng chuyền',
    province: 'Hà Nội',
    venueName: 'NTĐ Đại học Quốc Gia',
    time: '19:30 - 21:30',
    date: 'Tối nay',
    playersMax: 12,
    cost: '35.000đ/người',
    levelRequired: 'Phong trào (Hạng D-E)',
    playersJoined: 10,
    host: mockUsers[2]
  }
];

async function seedDatabase() {
  console.log('Bắt đầu tạo dữ liệu giả lập cho kèo ghép (Matches)...');
  const matchesCol = collection(db, 'Matches');

  for (const m of mockMatches) {
    const { host, ...matchData } = m;
    
    // Tự sinh ra 1 array joinedUsers ảo gồm id của host và random vài fake id khác để hợp logic số lượng
    const joinedUsers = [host.id];
    for (let i = 1; i < matchData.playersJoined; i++) {
      joinedUsers.push(`fakeUser_${Math.floor(Math.random() * 1000)}`);
    }

    const payload = {
      ...matchData,
      hostId: host.id,
      hostName: host.name,
      hostCredibility: host.score,
      joinedUsers: joinedUsers,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000)).toISOString() // random created time trong vài giờ qua
    };

    try {
      const docRef = await addDoc(matchesCol, payload);
      console.log(`Đã tạo kèo: ${payload.title} (ID: ${docRef.id})`);
    } catch (err) {
      console.error(`Lỗi khi tạo kèo ${payload.title}:`, err);
    }
  }

  console.log('Hoàn thành tạo dữ liệu giả lập!');
  process.exit(0);
}

seedDatabase();
