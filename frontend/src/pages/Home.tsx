import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api";
import { useAppContext } from "../context/AppContext";
import BannerCarousel, { type Banner } from "../components/BannerCarousel";
import TrendingPosts from "../components/TrendingPosts";
import RecentDrops from "../components/RecentDrops";

const Home = () => {
  const { token } = useAppContext();
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/banners`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json() as { banners: Banner[] };
        setBanners(data.banners);
      } catch {
        // No banners available — carousel renders nothing
      }
    };
    fetchBanners();
  }, [token]);

  return (
    <section className="home-page">
      <BannerCarousel banners={banners} />
      <TrendingPosts />
      <RecentDrops />
    </section>
  );
};

export default Home;