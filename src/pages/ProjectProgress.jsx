import Layout from "../components/common/Layout";

export default function ProjectProgress() {
  return (
    <Layout title="Project Progress">
      <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm">
        <div className="text-5xl mb-4">🔧</div>
        <h2 className="text-xl font-black text-gray-700 mb-2">System Under Maintenance</h2>
        <p className="text-gray-400 text-sm">This section is currently under maintenance. Please check back later.</p>
      </div>
    </Layout>
  );
}
