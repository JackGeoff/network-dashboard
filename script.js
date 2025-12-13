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
    let bandwidthCache = {}; // Cache for SNMP bandwidth deltas

    // Toggle SNMP fields
    snmpEnabledCheckbox.addEventListener('change', () => {
        snmpFields.style.display = snmpEnabledCheckbox.checked ? 'block' : 'none';
    });

    // Cancel edit
    cancelEditBtn.addEventListener('click', resetForm);

    // Submit form (add/edit)
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
        const url = id ? `/backend/api.php/devices/${id}` : '/backend/api.php/devices';

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        resetForm();
        loadDevices();
    });

    // Reset form
    function resetForm() {
        deviceForm.reset();
        editIdInput.value = '';
        snmpFields.style.display = 'none';
        cancelEditBtn.style.display = 'none';
    }

    // Load devices and monitor
    async function loadDevices() {
        const res = await fetch('/backend/api.php/devices');
        devices = await res.json();

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

    // Edit device
    window.editDevice = (id) => {
        const device = devices.find(d => d.id === id);
        if (device) {
            editIdInput.value = id;
            nameInput.value = device.name;
            hostInput.value = device.host;
            snmpEnabledCheckbox.checked = device.snmp_enabled;
            snmpCommunityInput.value = device.snmp_community || 'public';
            snmpVersionSelect.value = device.snmp_version || '2c';
            snmpFields.style.display = device.snmp_enabled ? 'block' : 'none';
            cancelEditBtn.style.display = 'inline-block';
        }
    };

    // Delete device
    window.deleteDevice = async (id) => {
        if (confirm('Are you sure?')) {
            await fetch(`/backend/api.php/devices/${id}`, { method: 'DELETE' });
            loadDevices();
        }
    };

    // Run traceroute
    window.runTraceroute = async (host) => {
        tracerouteOutput.textContent = 'Running traceroute...';
        tracerouteModal.show();

        const res = await fetch(`/backend/api.php/traceroute?host=${encodeURIComponent(host)}`);
        const data = await res.json();
        tracerouteOutput.textContent = data.output || data.error || 'No output';
    };

    // Monitor devices (ping + SNMP)
    async function monitorDevices() {
        for (const device of devices) {
            // Ping
            const pingRes = await fetch(`/backend/api.php/ping?host=${encodeURIComponent(device.host)}`);
            const pingData = await pingRes.json();

            document.getElementById(`status-${device.id}`).innerHTML = pingData.alive 
                ? '<span class="status-online">Online</span>' 
                : '<span class="status-offline">Offline</span>';
            document.getElementById(`latency-${device.id}`).textContent = pingData.latency ?? '-';
            document.getElementById(`lastseen-${device.id}`).textContent = pingData.last_seen ?? '-';

            // SNMP if enabled
            if (device.snmp_enabled) {
                const snmpRes = await fetch(`/backend/api.php/snmp?host=${encodeURIComponent(device.host)}&community=${encodeURIComponent(device.snmp_community)}&version=${device.snmp_version}`);
                const snmpData = await snmpRes.json();

                const cacheKey = device.id;
                let bandwidth = 'N/A';
                if (snmpData.in_octets && snmpData.out_octets) {
                    const now = Date.now();
                    if (bandwidthCache[cacheKey]) {
                        const deltaTime = (now - bandwidthCache[cacheKey].timestamp) / 1000; // seconds
                        const inDelta = snmpData.in_octets - bandwidthCache[cacheKey].in_octets;
                        const outDelta = snmpData.out_octets - bandwidthCache[cacheKey].out_octets;
                        const inKbps = (inDelta * 8 / deltaTime) / 1000; // bits per second to kbps
                        const outKbps = (outDelta * 8 / deltaTime) / 1000;
                        bandwidth = `${inKbps.toFixed(2)} kbps / ${outKbps.toFixed(2)} kbps`;
                    }
                    bandwidthCache[cacheKey] = { in_octets: snmpData.in_octets, out_octets: snmpData.out_octets, timestamp: now };
                }
                document.getElementById(`bandwidth-${device.id}`).textContent = bandwidth;
            }
        }
    }

    // Auto-refresh every 5 seconds
    setInterval(loadDevices, 5000); // Full reload to sync any changes
    loadDevices(); // Initial load
});