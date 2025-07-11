export default function Header() {
    return (
    <>
        <header className="header">
            <a href="/" className="logo">Tier Lists</a>
            <nav>
                <ul className="nav-list">
                    <li className="nav-item">
                        <a href="/" className="nav-link">Home</a>
                    </li>
                    <li className="nav-item">
                        <a href="/login" className="nav-link">Login</a>
                    </li>
                    <li className="nav-item">
                        <a href="/profile" className="nav-link">Profile</a>
                    </li>
                </ul>
            </nav>
        </header>
    </>
    )
}