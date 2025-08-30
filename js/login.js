// login.js
(function () {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Define a single location for the dashboard path. Using a relative
  // path anchored from the root index allows this script to work
  // regardless of where it is included. When loaded from the root
  // index.html this resolves to `pages/dashboard.html`.
  const DASHBOARD_PATH = 'pages/dashboard.html';

  const DEMO = { username: 'test', password: 'welcome1' };

  const form = document.getElementById('loginForm');
  const msg = document.getElementById('loginMsg');
  const btnDemo = document.getElementById('fillDemo');

  // Autofill demo creds when "Use demo" clicked
  if (btnDemo) {
    btnDemo.addEventListener('click', () => {
      document.getElementById('username').value = DEMO.username;
    });
  }

  // If already logged in, go directly to the dashboard page in the pages folder.
  if (sessionStorage.getItem('auth') === 'true') {
    window.location.href = DASHBOARD_PATH;
    return;
  }

  // Handle login form
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;

    if (u === DEMO.username && p === DEMO.password) {
      // Save session
      sessionStorage.setItem('auth', 'true');
      sessionStorage.setItem('username', u);

      msg.textContent = 'Login successful. Redirecting…';
      msg.classList.remove('error');
      msg.classList.add('ok');

      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = DASHBOARD_PATH;
      }, 800);
    } else {
      msg.textContent = 'Invalid credentials. Use test / test.';
      msg.classList.remove('ok');
      msg.classList.add('error');
    }
  });
})();
