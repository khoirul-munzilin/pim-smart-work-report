/*
  PIM Smart Work Report - Maintenance Request Order upgrade
  Muat SETELAH app.js dan user-management.js.
  Menggunakan global existing: sb, current, profile, machines, upload, load, show, toast, escapeHtml.
*/
(() => {
  const byId = (id) => document.getElementById(id);
  const searchInput = byId('machineSearchInput');
  const hiddenMachineId = byId('machineSelect');
  const suggestionBox = byId('machineSuggestions');
  const detailBox = byId('machineDetail');
  const createForm = byId('createForm');

  if (!searchInput || !hiddenMachineId || !suggestionBox || !createForm) {
    console.error('Maintenance upgrade: elemen pencarian mesin tidak ditemukan.');
    return;
  }

  // Select lama tetap dipakai sebagai hidden machine_id agar kompatibel dengan database.
  hiddenMachineId.classList.add('hidden');
  hiddenMachineId.required = false;

  const safe = (value) => typeof escapeHtml === 'function'
    ? escapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      })[char]);

  function machineText(machine) {
    return [
      machine.code,
      machine.name,
      machine.section,
      machine.plant_area,
      machine.function_location,
      machine.equipment_no,
      machine.machine_group
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function getSearchResults(query) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const source = Array.isArray(machines) ? machines : [];
    if (!terms.length) return source.slice(0, 40);
    return source
      .filter((machine) => terms.every((term) => machineText(machine).includes(term)))
      .slice(0, 80);
  }

  function closeSuggestions() {
    suggestionBox.classList.add('hidden');
  }

  function selectMachine(machine) {
    hiddenMachineId.value = machine.id;
    searchInput.value = `[${machine.machine_group || 'GENERAL'}] ${machine.name} • ${machine.code}`;
    detailBox.innerHTML = `
      <b>${safe(machine.name)}</b><br>
      Group: <b>${safe(machine.machine_group || 'GENERAL')}</b><br>
      Plant/Area: ${safe(machine.plant_area || machine.section || '-')}<br>
      Functional Location: ${safe(machine.function_location || '-')}<br>
      Equipment No.: ${safe(machine.equipment_no || '-')}
    `;
    closeSuggestions();
  }

  function renderSuggestions() {
    const results = getSearchResults(searchInput.value);
    suggestionBox.innerHTML = results.length
      ? results.map((machine) => `
          <button type="button" class="machine-search-option" data-id="${safe(machine.id)}">
            <b>[${safe(machine.machine_group || 'GENERAL')}] ${safe(machine.name)} • ${safe(machine.code)}</b>
            <small>${safe(machine.plant_area || machine.section || '-')}<br>${safe(machine.function_location || '-')} • Eq: ${safe(machine.equipment_no || '-')}</small>
          </button>
        `).join('')
      : '<div class="machine-search-empty">Mesin tidak ditemukan.</div>';

    suggestionBox.classList.remove('hidden');
    suggestionBox.querySelectorAll('[data-id]').forEach((button) => {
      button.onclick = () => {
        const machine = machines.find((item) => String(item.id) === button.dataset.id);
        if (machine) selectMachine(machine);
      };
    });
  }

  searchInput.addEventListener('focus', renderSuggestions);
  searchInput.addEventListener('input', () => {
    hiddenMachineId.value = '';
    renderSuggestions();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSuggestions();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.machine-search-wrap')) closeSuggestions();
  });

  // Ganti penyimpanan laporan lama dengan Maintenance Request Order.
  createForm.onsubmit = async (event) => {
    event.preventDefault();

    try {
      const formData = new FormData(event.target);
      const technicianId = formData.get('technician_id');
      const machineId = hiddenMachineId.value;
      const requestType = formData.get('request_type');
      const photo = formData.get('photo');

      if (!machineId) throw new Error('Cari dan pilih mesin terlebih dahulu.');
      if (!technicianId) throw new Error('Pilih technician terlebih dahulu.');
      if (!requestType) throw new Error('Pilih jenis pekerjaan.');
      if (!photo || !photo.name) throw new Error('Dokumentasi kondisi awal wajib diunggah.');

      const requestNumber =
        'MRO-' +
        new Date().toISOString().slice(0, 10).replaceAll('-', '') +
        '-' + String(Date.now()).slice(-5);

      const { data, error } = await sb
        .from('reports')
        .insert({
          report_no: requestNumber,
          machine_id: machineId,
          reporter_id: current.id,
          technician_id: technicianId,
          shift: formData.get('shift'),
          priority: formData.get('priority'),
          request_type: requestType,
          problem: formData.get('problem'),
          impact: formData.get('impact'),
          status: 'OPEN'
        })
        .select()
        .single();

      if (error) throw error;

      // Dokumentasi tetap disimpan menggunakan stage lama agar data lama kompatibel.
      await upload(photo, data.id, 'PROBLEM');

      event.target.reset();
      hiddenMachineId.value = '';
      searchInput.value = '';
      detailBox.textContent = 'Cari dan pilih mesin untuk menampilkan detail aset.';
      await load();
      show('dashboard');
      toast('Maintenance Request Order berhasil dikirim');
    } catch (error) {
      console.error('Gagal membuat Maintenance Request Order:', error);
      toast(error.message);
    }
  };
})();
