import { hashPassword } from '@/lib/auth/password'

// 사용법: npm run hash-password -- '<비밀번호>'
// 출력된 한 줄을 .env 의 APP_PASSWORD_HASH 에 넣는다.

const password = process.argv[2]
if (!password) {
  console.error("사용법: npm run hash-password -- '<비밀번호>'")
  process.exit(1)
}

hashPassword(password).then((hash) => {
  console.log(`APP_PASSWORD_HASH=${hash}`)
})
