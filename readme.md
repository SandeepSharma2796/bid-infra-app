# For change to C to D
D:

# For BE
run start_server in D:\bid-infra-app\backend directory by UI
cd "D:\bid-infra-app\backend"
set GEMINI_API_KEY=AIzaSyAtsA3dxeETjCttZ1HvoNhM4b9QgSfQOfI

uvicorn main:app --reload --port 8000

# For FE
npm install
cd "D:\bid-infra-app\frontend"
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
npm run dev

http://localhost:3000


git init
git add .
git commit -m "Initial commit"

