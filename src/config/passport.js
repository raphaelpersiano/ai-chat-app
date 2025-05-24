const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

// Serialize: Simpan hanya user.id di session
passport.serializeUser((user, done) => {
  done(null, user.id); // Hanya simpan Google ID
});

// Deserialize: Ambil user.id dari session, bisa tambahkan logic ambil data dari DB jika perlu
passport.deserializeUser((id, done) => {
  // Kalau mau ambil data user lengkap dari DB, tambahkan query ke DB di sini
  // Misal:
  // const user = await pool.query("SELECT * FROM usercreditinsights WHERE user_id = $1", [id]);
  // done(null, user.rows[0]);

  // Kalau nggak, cukup kembalikan ID saja
  done(null, { id });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.CALLBACK_URL,
      scope: ['profile', 'email']
    },
    (accessToken, refreshToken, profile, done) => {
      // Simpan atau ambil user dari database
      const user = {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails[0].value,
        photo: profile.photos[0].value
      };
      return done(null, user);
    }
  )
);

module.exports = passport;
