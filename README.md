# Smart Booking v2

Har business ka apna AI booking assistant. Node.js + Express + MongoDB Atlas + Gemini.

## Kya badla (purane version se)

| Pehle | Ab |
|---|---|
| Admin PIN `4646` code me khula | Hata diya. Har business ka apna phone + password login |
| `/api/data` sabki bookings dikhata tha | Hata diya. Owner sirf apni bookings dekhta hai (JWT login) |
| `/api/cloud-state` koi bhi overwrite kar sakta tha | Hata diya |
| Password plain text | bcrypt hash |
| OTP screen par dikh jata tha | Hata diya (neeche "Abhi nahi hai" dekho) |
| Bookings `database.json` me (Render par ud jaati thi) | MongoDB Atlas me |
| Double booking ho sakti thi | Slot lock + database unique index. 4 logon ke ek saath try karne par sirf ek jeetta hai (test me verify) |
| Gemini sirf free text save karta tha | Gemini tools: `check_slots`, `create_booking`. Business ID model se nahi aati |
| Koi rate limit nahi | Login, chat, aur har business ka daily AI limit |

## Chalane ke steps

1. `npm install`
2. `.env.example` ko `.env` me copy karo aur values bharo (MongoDB URI, Gemini key, JWT_SECRET)
3. `npm start` aur `http://localhost:3000` kholo
4. Tests: `npm test`

## Render par deploy

- Build command: `npm install`, Start command: `npm start`, Node 20+
- Environment me `MONGODB_URI`, `GEMINI_API_KEY`, `GEMINI_MODELS`, `JWT_SECRET` daalo (`.env` file GitHub par mat daalo)
- MongoDB Atlas > Network Access me Render ke liye access allow karo

## Jo aapko khud karna hai

- [ ] `public/privacy.html` me `REPLACE_WITH_YOUR_SUPPORT_EMAIL` ki jagah asli email likho (Play Store ke liye zaroori)
- [ ] `GEMINI_MODELS` me Google ki official list se sahi model naam rakho
- [ ] Purani repo me Admin PIN ya koi key kabhi commit hui ho to Gemini key aur MongoDB password naye bana lo
- [ ] Purana data (`database.json`) naye schema me migrate nahi hua. Naye accounts se shuru hoga

## Abhi nahi hai (agle step)

- OTP verification: asli SMS (MSG91/Twilio) ke saath hi lagana, tab tak password login hai
- WhatsApp alerts: abhi dashboard me WhatsApp link hai, automatic message nahi
- Password reset
