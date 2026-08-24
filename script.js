const form = document.querySelector('#login-form');
const email = document.querySelector('#email');
const password = document.querySelector('#password');
const emailError = document.querySelector('#email-error');
const passwordError = document.querySelector('#password-error');
const formStatus = document.querySelector('#form-status');
const toggle = document.querySelector('.password-toggle');

function validateForm() {
  let isValid = true;
  emailError.textContent = '';
  passwordError.textContent = '';
  formStatus.textContent = '';

  if (!email.validity.valid) {
    emailError.textContent = 'Enter a valid work email.';
    isValid = false;
  }

  if (password.value.length < 8) {
    passwordError.textContent = 'Password must be at least 8 characters.';
    isValid = false;
  }

  return isValid;
}

toggle.addEventListener('click', () => {
  const isVisible = password.type === 'text';
  password.type = isVisible ? 'password' : 'text';
  toggle.textContent = isVisible ? 'Show' : 'Hide';
  toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
  toggle.setAttribute('aria-pressed', String(!isVisible));
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateForm()) return;
  formStatus.textContent = 'Details look good. Connecting you now...';
});

[email, password].forEach((field) => {
  field.addEventListener('input', () => {
    field.closest('.field-group').querySelector('.field-error').textContent = '';
    formStatus.textContent = '';
  });
});
