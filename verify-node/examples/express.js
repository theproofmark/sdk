/**
 * Minimal Express example for @proofmark/verify-node.
 *
 * Run: PMV_SECRET_KEY=pmvs_test_always_pass node express.js
 * Visit: http://localhost:3000
 */

const express = require('express');
const { ProofMarkVerify } = require('@proofmark/verify-node');
// Or: const { proofmarkVerifyMiddleware } = require('@proofmark/verify-node/middleware');

const app = express();
app.use(express.urlencoded({ extended: true }));

const pmv = new ProofMarkVerify({
  secret: process.env.PMV_SECRET_KEY || 'pmvs_test_always_pass',
});

// Serve a minimal signup form using the test sitekey for local dev.
app.get('/', (_req, res) => {
  res.send(`
    <!doctype html>
    <html><body style="font-family: system-ui; max-width: 480px; margin: 40px auto;">
      <h1>Sign up</h1>
      <form action="/signup" method="POST">
        <p><label>Email <input name="email" type="email" required></label></p>
        <div class="pm-verify" data-sitekey="pmv_test_always_pass"></div>
        <p><button type="submit">Sign up</button></p>
      </form>
      <script src="http://localhost:8080/verify/api.js" async defer></script>
      <p style="color:#666; font-size:14px;">Using ProofMark Verify test keys.</p>
    </body></html>
  `);
});

app.post('/signup', async (req, res) => {
  const token = req.body['pm-verify-response'];
  if (!token) {
    return res.status(400).send('Verification token missing.');
  }

  try {
    const result = await pmv.verify(token, { remoteip: req.ip });
    if (!result.success) {
      return res
        .status(400)
        .send(`Verification failed: ${(result['error-codes'] || []).join(', ')}`);
    }
    if (result.score < 0.5) {
      return res.status(400).send(`Score too low: ${result.score}`);
    }
    res.send(
      `Signup ok! Score: ${result.score}. Flags: ${result.flags.join(', ') || '(none)'}.`
    );
  } catch (err) {
    console.error('siteverify error', err);
    res.status(500).send('Verification service unavailable.');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Example app running at http://localhost:${port}`);
  console.log('Make sure ProofMark backend is running on :8080 (or update widget script src).');
});
