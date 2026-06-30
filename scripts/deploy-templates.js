const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'xjdjlxfulpqpundkcdul';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('\x1b[31mError: SUPABASE_ACCESS_TOKEN environment variable is not set.\x1b[0m');
  console.log('To obtain a token, go to: https://supabase.com/dashboard/account/tokens');
  console.log('Then run:');
  console.log('  export SUPABASE_ACCESS_TOKEN="your-token"');
  console.log('  node scripts/deploy-templates.js\n');
  process.exit(1);
}

const templatesDir = path.join(__dirname, '../supabase/templates');

const readTemplate = (filename) => {
  const filePath = path.join(templatesDir, filename);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`\x1b[31mFailed to read template ${filename}:\x1b[0m`, error.message);
    process.exit(1);
  }
};

const payload = {
  // Confirmation Signup
  mailer_subjects_confirmation: "[NIX] Confirm your email / Potwierdź swój adres e-mail",
  mailer_templates_confirmation_content: readTemplate('confirmation.html'),

  // Password Recovery / Reset
  mailer_subjects_recovery: "[NIX] Reset your password / Zresetuj swoje hasło",
  mailer_templates_recovery_content: readTemplate('recovery.html'),

  // Magic Link
  mailer_subjects_magic_link: "[NIX] Sign in to NIX / Zaloguj się do NIX",
  mailer_templates_magic_link_content: readTemplate('magic_link.html'),

  // Email Change
  mailer_subjects_email_change: "[NIX] Confirm email change / Potwierdź zmianę e-maila",
  mailer_templates_email_change_content: readTemplate('email_change.html'),

  // Invite User
  mailer_subjects_invite: "[NIX] You're invited to join NIX / Zaproszenie do aplikacji NIX",
  mailer_templates_invite_content: readTemplate('invite.html'),
};

console.log(`Deploying templates to Supabase project: \x1b[36m${PROJECT_REF}\x1b[0m...`);

fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
})
  .then(async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response.json();
  })
  .then((data) => {
    console.log('\n\x1b[32m✔ Email templates successfully deployed to Supabase!\x1b[0m');
    console.log('The following templates are now active in the cloud:');
    console.log(' - Confirmation (Signup)');
    console.log(' - Recovery (Password Reset)');
    console.log(' - Magic Link');
    console.log(' - Email Change');
    console.log(' - Invite User\n');
  })
  .catch((error) => {
    console.error('\n\x1b[31m✖ Deployment failed:\x1b[0m', error.message);
    process.exit(1);
  });
