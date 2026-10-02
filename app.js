/* PIM Smart Work Report - FunLoc display fix
   Tambahkan file ini setelah app.js pada index.html. */
(() => {
  const $id = (id) => document.getElementById(id);
  const cleanKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function flexibleValue(object, aliases) {
    if (!object) return '';
    const wanted = aliases.map(cleanKey);
    const key = Object.keys(object).find((name) => wanted.includes(cleanKey(name)));
    return key ? object[key] : '';
  }

  function funloc(machine) {
    return flexibleValue(machine, [
      'function_location', 'functional_location', 'function location',
      'functional location', 'functional_loc', 'functionalloc',
      'funcloc', 'func_loc', 'floc', 'fun_loc'
    ]);
  }

  function equipment(machine) {
    return flexibleValue(machine, [
      'equipment_no', 'equipment_number', 'equipment number',
      'equipmentno', 'equip_no', 'equ_no', 'equipment'
    ]);
  }

  function group(machine) {
    return String(flexibleValue(machine, [
      'machine_group', 'machine group', 'machinegroup', 'group_name', 'group'
    ]) || 'GENERAL').toUpperCase();
  }

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function refreshSelectedMachine() {
    const select = $id('machineSelect');
    const detail = $id('machineDetail');
    if (!select || !detail || !select.value || !Array.isArray(machines)) return;

    const machine = machines.find((item) => String(item.id) === String(select.value));
    if (!machine) return;

    const machineGroup = group(machine);
    const functionalLocation = funloc(machine);
    const equipmentNumber = equipment(machine);
    const groupDisplay = $id('machineGroupDisplay');
    if (groupDisplay) groupDisplay.value = machineGroup;

    detail.innerHTML = `
      <b>${esc(machine.code || machine.name || '-')}</b>
      <p>Nama: ${esc(machine.name || '-')}</p>
      <p>Group: ${esc(machineGroup)}</p>
      <p>Area/Section: ${esc(machine.plant_area || machine.section || '-')}</p>
      <p>Functional Location: ${esc(functionalLocation || 'Data FunLoc kosong di respons Supabase')}</p>
      <p>Equipment No.: ${esc(equipmentNumber || 'Data Equipment kosong')}</p>
    `;
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-machine-id], .machine-option, .machine-search-option')) {
      setTimeout(refreshSelectedMachine, 50);
    }
  }, true);

  const select = $id('machineSelect');
  if (select) select.addEventListener('change', refreshSelectedMachine);
})();
