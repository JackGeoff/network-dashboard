document.addEventListener('DOMContentLoaded', () => {
    const deviceForm = document.getElementById('deviceForm');
    const editIdInput = document.getElementById('editId');
    const nameInput = document.getElementById('name');
    const hostInput = document.getElementById('host');
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

    // Toggle SNMP fields
    snmpEnabledCheckbox.addEventListener('change', () => {
        snmpFields.style.display = snmpEnabledCheckbox.checked ? 'block' : 'none';
    });

    cancelEditBtn.addEventListener('click', resetForm);

    // Add / Edit device
    deviceForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = editIdInput.value;
        const data = {
            name: nameInput.value.trim(),
            host: hostInput.value.trim(),
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
        snmpFields.style.display = 'none';
        cancelEditBtn.style.display = 'none';
    }

    // Load devices
    async function loadDevices() {
        const res = await fetch('/backend/api.php/devices');
        devices = await res.json(); // FIXED (no const)

        tableBody.innerHTML = '';
        devices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.host}</td>
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

    // Edit
    window.editDevice = (id) => {
        const device = devices.find(d => d.id === id);
        if (!device) return;

        editIdInput.value = id;
        nameInput.value = device.name;
        hostInput.value = device.host;
        snmpEnabledCheckbox.checked = device.snmp_enabled;
        snmpCommunityInput.value = device.snmp_community || 'public';
        snmpVersionSelect.value = device.snmp_version || '2c';
        snmpFields.style.display = device.snmp_enabled ? 'block' : 'none';
        cancelEditBtn.style.display = 'inline-block';
    };

    // Delete
    window.deleteDevice = async (id) => {
        if (!confirm('Delete this device?')) return;
        await fetch(`/backend/api.php/devices/${id}`, { method: 'DELETE' });
        loadDevices();
    };

    // Traceroute
    window.runTraceroute = async (host) => {
        tracerouteOutput.textContent = 'Running traceroute...';
        tracerouteModal.show();

        const res = await fetch(`/backend/api.php/traceroute?host=${encodeURIComponent(host)}`);
        const data = await res.json();
        tracerouteOutput.textContent = data.output || data.error || 'No output';
    };

    // Monitor devices (TCP + SNMP)
    async function monitorDevices() {
        for (const device of devices) {
            try {
                // TCP health check
                const res = await fetch(`/backend/api.php/ping?host=${encodeURIComponent(device.host)}`);
                const data = await res.json();

                document.getElementById(`status-${device.id}`).innerHTML =
                    data.alive
                        ? '<span class="status-online">Online</span>'
                        : '<span class="status-offline">Offline</span>';

                document.getElementById(`latency-${device.id}`).textContent =
                    data.latency ?? '-';

                document.getElementById(`lastseen-${device.id}`).textContent =
                    data.last_seen ?? '-';

                // SNMP
                if (device.snmp_enabled) {
                    const snmpRes = await fetch(
                        `/backend/api.php/snmp?host=${device.host}&community=${device.snmp_community}&version=${device.snmp_version}`
                    );
                    const snmpData = await snmpRes.json();

                    let bandwidth = 'N/A';
                    const key = device.id;
                    const now = Date.now();

                    if (snmpData.in_octets && snmpData.out_octets) {
                        if (bandwidthCache[key]) {
                            const dt = (now - bandwidthCache[key].t) / 1000;
                            const inKbps = ((snmpData.in_octets - bandwidthCache[key].in) * 8) / dt / 1000;
                            const outKbps = ((snmpData.out_octets - bandwidthCache[key].out) * 8) / dt / 1000;
                            bandwidth = `${inKbps.toFixed(2)} / ${outKbps.toFixed(2)} kbps`;
                        }
                        bandwidthCache[key] = {
                            in: snmpData.in_octets,
                            out: snmpData.out_octets,
                            t: now
                        };
                    }

                    document.getElementById(`bandwidth-${device.id}`).textContent = bandwidth;
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    loadDevices();
    setInterval(monitorDevices, 5000);
});
