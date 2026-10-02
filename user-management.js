// PIM Smart Work Report - Kelola Akun
// Memerlukan variabel global: sb, profile, toast, dan fungsi $ dari app.js.

const userForm = document.getElementById('userForm');

if (userForm) {
  userForm.onsubmit = async (event) => {
    event.preventDefault();

    const button = document.getElementById('createUserButton');
    const formData = new FormData(event.target);
    const requestedRole = formData.get('role');

    if (!['admin', 'supervisor'].includes(profile?.role)) {
      return toast('Anda tidak memiliki izin membuat akun.');
    }

    if (!['operator', 'supervisor'].includes(requestedRole)) {
      return toast('Role hanya boleh Operator atau Supervisor.');
    }

    button.disabled = true;
    button.textContent = 'MEMBUAT AKUN...';

    try {
      const { data, error } = await sb.functions.invoke('create-user', {
        body: {
          full_name: String(formData.get('full_name') || '').trim(),
          email: String(formData.get('email') || '').trim().toLowerCase(),
          password: String(formData.get('password') || ''),
          role: requestedRole,
          section: String(formData.get('section') || '').trim()
        }
      });

      if (error) {
        let message = error.message;
        try {
          const responseBody = await error.context.json();
          message = responseBody.error || message;
        } catch (_) {}
        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Akun gagal dibuat.');
      }

      event.target.reset();
      toast(`Akun ${data.profile.full_name} berhasil dibuat`);
    } catch (error) {
      console.error('Gagal membuat akun:', error);
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'BUAT AKUN';
    }
  };
}
