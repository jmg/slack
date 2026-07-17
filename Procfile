# shipdeck process model — https://docs (docs/PROCFILE.md in the platform repo)
# web:     the routed process. `next start` binds to $PORT, injected by shipdeck.
# release: runs once before traffic shifts — applies pending DB migrations.
web: npm run start -- -p ${PORT:-3000}
release: npx prisma migrate deploy
