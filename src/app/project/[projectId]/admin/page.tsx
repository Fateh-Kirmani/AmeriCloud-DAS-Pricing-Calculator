import { redirect } from 'next/navigation';

export default function ProjectAdminIndexPage({ params }: { params: { projectId: string } }) {
  redirect(`/project/${params.projectId}/admin/materials`);
}
