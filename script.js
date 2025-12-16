document.addEventListener('DOMContentLoaded', () => {
    const deviceForm = document.getElementById('deviceForm');
    const editIdInput = document.getElementById('editId');
    const nameInput = document.getElementById('name');
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');

    const snmpEnabledCheckbox = document.getElementById('snmpEnabled');
    const snmpFields = document.getElementById('snmpFields');
    const snmpCommunityInput = document.getElementById('snmpCommunity');
    const snmpVersionSelect = document.getElementById('snmpVersion');
    const cancelEditBtn = document.getElementById('cancelEdit');

    const tableBody = document.querySelector('#devicesTable tbody');
    const tracerouteModal = new bootstrap.Modal(document.getElementById('tracerouteModal'));
    const tracerouteOutput = document.getElementById('tracerouteOutput');

    let devices = [];
    let bandwidthCache = {};

    snmpEnabledCheckbox.addEventListener('change', () => {
        snmpFields.style.display = snmpEnabledCheckbox.checked ? 'block' : 'none';
    });

    cancelEditBtn.addEventListener('click', resetForm);

    // ADD / EDIT DEVICE
    deviceForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = editIdInput.value;

        const data = {
            name: nameInput.value.trim(),
            host: hostInput.value.trim(),
            port: Number(portInput.value),
            snmp_enabled: snmpEnabledCheckbox.checked,
            snmp_community: snmpCommunityInput.value.trim(),
            snmp_version: snmpVersionSelect.value
        };

        const method = id ? 'PUT' : 'POST';
        const url = id
            ? `/backend/api.php/devices/${id}`
            : `/backend/api.php/devices`;

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        resetForm();
        loadDevices();
    });

    function resetForm() {
        deviceForm.reset();
        editIdInput.value = '';
        portInput.value = 80;
        snmpFields.style.display = 'none';
        cancelEditBtn.style.display = 'none';
    }

    // LOAD DEVICES
    async function loadDevices() {
        const res = await fetch('/backend/api.php/devices');
        devices = await res.json();

        tableBody.innerHTML = '';
        devices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.host}:${device.port}</td>
                <td id="status-${device.id}">-</td>
                <td id="latency-${device.id}">-</td>
                <td id="lastseen-${device.id}">-</td>
                <td id="bandwidth-${device.id}">-</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editDevice(${device.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDevice(${device.id})">Delete</button>
                    <button class="btn btn-sm btn-info" onclick="runTraceroute('${device.host}')">Traceroute</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        monitorDevices();
    }

    // EDIT
    window.editDevice = (id) => {
        const d = devices.find(x => x.id === id);
        if (!d) return;

        editIdInput.value = id;
        nameInput.value = d.name;
        hostInput.value = d.host;
        portInput.value = d.port || 80;

        snmpEnabledCheckbox.checked = d.snmp_enabled;
        snmpCommunityInput.value = d.snmp_community || 'public';
        snmpVersionSelect.value = d.snmp_version || '2c';
        snmpFields.style.display = d.snmp_enabled ? 'block' : 'none';
        cancelEditBtn.style.display = 'inline-block';
    };

    // DELETE
    window.deleteDevice = async (id) => {
        if (!confirm('Delete this device?')) return;
        await fetch(`/backend/api.php/devices/${id}`, { method: 'DELETE' });
        loadDevices();
    };

    // TRACEROUTE
    window.runTraceroute = async (host) => {
        tracerouteOutput.textContent = 'Running traceroute...';
        tracerouteModal.show();

        const res = await fetch(`/backend/api.php/traceroute?host=${encodeURIComponent(host)}`);
        const data = await res.json();
        tracerouteOutput.textContent = data.output || data.error || 'No output';
    };

    // MONITOR (TCP + SNMP)
    async function monitorDevices() {
        for (const d of devices) {
            try {
                const res = await fetch(
                    `/backend/api.php/ping?host=${encodeURIComponent(d.host)}&port=${d.port}`
                );
                const data = await res.json();

                document.getElementById(`status-${d.id}`).innerHTML =
                    data.alive
                        ? '<span class="status-online">Online</span>'
                        : '<span class="status-offline">Offline</span>';

                document.getElementById(`latency-${d.id}`).textContent = data.latency ?? '-';
                document.getElementById(`lastseen-${d.id}`).textContent = data.last_seen ?? '-';

                // SNMP (optional)
                if (d.snmp_enabled) {
                    const snmpRes = await fetch(
                        `/backend/api.php/snmp?host=${d.host}&community=${d.snmp_community}&version=${d.snmp_version}`
                    );
                    const s = await snmpRes.json();

                    let bw = 'N/A';
                    const now = Date.now();

                    if (s.in_octets && s.out_octets) {
                        if (bandwidthCache[d.id]) {
                            const dt = (now - bandwidthCache[d.id].t) / 1000;
                            const inK = ((s.in_octets - bandwidthCache[d.id].i) * 8) / dt / 1000;
                            const outK = ((s.out_octets - bandwidthCache[d.id].o) * 8) / dt / 1000;
                            bw = `${inK.toFixed(2)} / ${outK.toFixed(2)} kbps`;
                        }
                        bandwidthCache[d.id] = { i: s.in_octets, o: s.out_octets, t: now };
                    }
                    document.getElementById(`bandwidth-${d.id}`).textContent = bw;
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    loadDevices();
    setInterval(monitorDevices, 5000);
});
