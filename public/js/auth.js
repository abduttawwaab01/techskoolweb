document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const form = loginForm || signupForm;
  if (!form) return;

  const errorElement = document.getElementById('formError');
  const button = document.getElementById('submitBtn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorElement.textContent = '';
    button.disabled = true;
    button.textContent = 'Please wait…';

    const values = new FormData(form);
    const isLogin = Boolean(loginForm);
    const payload = isLogin
      ? { email: values.get('email'), password: values.get('password') }
      : {
          displayName: values.get('displayName'),
          email: values.get('email'),
          password: values.get('password'),
          confirmPassword: values.get('confirmPassword'),
        };

    try {
      await api(isLogin ? '/api/auth/login' : '/api/auth/signup', {
        method: 'POST',
        body: payload,
      });
      window.location.assign('/');
    } catch (error) {
      errorElement.textContent = error.message;
      button.disabled = false;
      button.textContent = isLogin ? 'Sign in' : 'Create account';
    }
  });
});
