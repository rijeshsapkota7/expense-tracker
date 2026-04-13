import dynamic from "next/dynamic";
import Head from "next/head";

// Dynamic import with ssr:false — the app uses localStorage and window APIs
// that are not available during server-side rendering.
const RijeshApp = dynamic(() => import("../components/RijeshApp"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0b0d14",
        gap: 20,
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@700&display=swap');`}</style>
      <div style={{ fontWeight: 700, fontSize: 24, color: "#fff", letterSpacing: "-.02em" }}>
        Rijesh<span style={{ color: "#6366f1" }}>.</span>Finance
      </div>
      <div
        style={{
          width: 180,
          height: 2,
          background: "linear-gradient(90deg,transparent,#6366f1,transparent)",
          backgroundSize: "200%",
          animation: "shimmer 1.5s infinite",
        }}
      />
      <style>{`@keyframes shimmer{0%{background-position:-200%}100%{background-position:200%}}`}</style>
    </div>
  ),
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Rijesh Finance</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <RijeshApp />
    </>
  );
}
