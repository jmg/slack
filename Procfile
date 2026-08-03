# deploycloud process model — see docs/PROCFILE.md in the platform repo
# web:     the routed process. `next start` binds to $PORT, injected by deploycloud.
# release: runs once before traffic shifts — applies pending DB migrations.
web: npm run start -- -p ${PORT:-3000}
release: npx prisma migrate deploy
