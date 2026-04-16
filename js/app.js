// app.js
const client = supabase.createClient(
    'https://bwfwnpdjeovqeznwbckx.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZnducGRqZW92cWV6bndiY2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTI2NzIsImV4cCI6MjA5MTc2ODY3Mn0.QohjsfSgvw64ZwSLRCtr_4rh49JyInEmrpDdzrXISQU'
);

// Global variables
let currentEditingId = null;

// Initialize mobile menu
function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    if (!hamburger || !mobileMenu || !closeMenu) return;

    hamburger.addEventListener('click', () => mobileMenu.classList.add('active'));
    closeMenu.addEventListener('click', () => mobileMenu.classList.remove('active'));

    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
        });
    });
}

// Load Members
async function loadMembers() {
    const tbody = document.getElementById('membersBody');
    const listContainer = document.getElementById('membersList');
    if (!tbody || !listContainer) return;

    const { data, error } = await client
        .from('members')
        .select('*')
        .order('joined_date', { ascending: false });

    tbody.innerHTML = '';
    listContainer.innerHTML = '';

    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="7">Error loading members</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">No members found yet.</td></tr>`;
        listContainer.innerHTML = `<p style="padding:1rem; text-align:center;">No members found yet.</p>`;
        return;
    }

    // Desktop Table
    data.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${member.full_name || 'N/A'}</strong></td>
            <td>${member.email || 'N/A'}</td>
            <td>${member.phone || 'N/A'}</td>
            <td>${member.role || 'Member'}</td>
            <td><span class="status ${member.status === 'Active' ? 'active' : 'inactive'}">${member.status || 'Active'}</span></td>
            <td>${new Date(member.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td>
                <button class="action-btn edit-btn" data-id="${member.id}">Edit</button>
                <button class="action-btn delete-btn" data-id="${member.id}">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Mobile Cards
    data.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `
            <div><strong>${member.full_name || 'N/A'}</strong></div>
            <div class="member-info"><span>Email</span><span>${member.email || 'N/A'}</span></div>
            <div class="member-info"><span>Phone</span><span>${member.phone || 'N/A'}</span></div>
            <div class="member-info"><span>Role</span><span>${member.role || 'Member'}</span></div>
            <div class="member-info"><span>Status</span><span><span class="status ${member.status === 'Active' ? 'active' : 'inactive'}">${member.status || 'Active'}</span></span></div>
            <div class="member-info"><span>Joined</span><span>${new Date(member.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span></div>
            <div style="margin-top: 1rem; display: flex; gap: 10px;">
                <button class="action-btn edit-btn" data-id="${member.id}" style="flex:1;">Edit</button>
                <button class="action-btn delete-btn" data-id="${member.id}" style="flex:1;">Delete</button>
            </div>
        `;
        listContainer.appendChild(card);
    });

    // Add event listeners for Edit & Delete buttons
    addActionListeners();
}

// Add event listeners for edit and delete
function addActionListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => editMember(btn.dataset.id));
    });

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteMember(btn.dataset.id));
    });
}

// Open modal for Add or Edit
function openMemberModal(member = null) {
    const modal = document.getElementById('memberModal');
    const form = document.getElementById('memberForm');
    const title = document.getElementById('modalTitle');

    form.reset();
    document.getElementById('memberId').value = '';

    if (member) {
        // Edit mode
        title.textContent = 'Edit Member';
        currentEditingId = member.id;
        document.getElementById('memberId').value = member.id;
        document.getElementById('fullName').value = member.full_name || '';
        document.getElementById('email').value = member.email || '';
        document.getElementById('phone').value = member.phone || '';
        document.getElementById('role').value = member.role || 'Member';
        document.getElementById('status').value = member.status || 'Active';
    } else {
        // Add mode
        title.textContent = 'Add New Member';
        currentEditingId = null;
    }

    modal.classList.add('active');
}

// Save member (Add or Update)
async function saveMember(e) {
    e.preventDefault();

    const memberData = {
        full_name: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        role: document.getElementById('role').value,
        status: document.getElementById('status').value,
        joined_date: currentEditingId ? undefined : new Date().toISOString()  // Only set on create
    };

    let error;

    if (currentEditingId) {
        // Update existing member
        ({ error } = await client
            .from('members')
            .update(memberData)
            .eq('id', currentEditingId));
    } else {
        // Insert new member
        ({ error } = await client
            .from('members')
            .insert([memberData]));
    }

    if (error) {
        alert('Error saving member: ' + error.message);
        return;
    }

    // Success
    document.getElementById('memberModal').classList.remove('active');
    loadMembers(); // Refresh the list
}

// Delete member
async function deleteMember(id) {
    if (!confirm('Are you sure you want to delete this member?')) return;

    const { error } = await client
        .from('members')
        .delete()
        .eq('id', id);

    if (error) {
        alert('Error deleting member: ' + error.message);
        return;
    }

    loadMembers();
}

// Edit member
async function editMember(id) {
    const { data, error } = await client
        .from('members')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        alert('Error loading member data');
        return;
    }

    openMemberModal(data);
}

// Logout
async function logout() {
    await client.auth.signOut();
    window.location.href = 'auth/login.html';
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    // Load navbar
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            const placeholder = document.getElementById('navbar-placeholder');
            if (placeholder) placeholder.innerHTML = data;
            setTimeout(initMobileMenu, 100);
        })
        .catch(err => console.error('Error loading navbar:', err));

    // Load members
    loadMembers();

    // Modal event listeners
    const modal = document.getElementById('memberModal');
    const addBtn = document.getElementById('addMemberBtn');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const form = document.getElementById('memberForm');

    addBtn.addEventListener('click', () => openMemberModal());
    closeModal.addEventListener('click', () => modal.classList.remove('active'));
    cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    form.addEventListener('submit', saveMember);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});