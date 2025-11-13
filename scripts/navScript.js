function toggleMenu() {
    const drawer = document.getElementById("mobile_nav_container");
    const btn = document.getElementById("menuToggleButton");
    const isActive = drawer.classList.toggle("active");
    if (btn) {
        btn.setAttribute("aria-expanded", isActive ? "true" : "false");
    }
    document.body.style.overflow = isActive ? "hidden" : "";
}

// Close drawer on link click for better UX on mobile
document.addEventListener("click", (e) => {
    const drawer = document.getElementById("mobile_nav_container");
    if (!drawer) return;
    if (drawer.classList.contains("active") && e.target.closest(".mobile_navlist a")) {
        toggleMenu();
    }
});

// Allow Escape key to close the mobile menu
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const drawer = document.getElementById("mobile_nav_container");
        if (drawer && drawer.classList.contains("active")) {
            toggleMenu();
        }
    }
});