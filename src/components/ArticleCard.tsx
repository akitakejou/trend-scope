import Image from "next/image";
import Link from "next/link";

export default function ArticleCard({
  id,
  title,
  category,
  summary,
  image,
}: any) {
  return (
    <Link href={`/article/${id}`}>
      <div className="border p-4 rounded-lg hover:shadow-xl transition">
        <Image
          src={image}
          alt={title}
          width={400}
          height={250}
          className="rounded"
        />

        <h2 className="text-xl font-bold mt-2">{title}</h2>

        <span className="text-sm bg-gray-200 px-2 py-1 rounded">
          {category}
        </span>

        <p className="mt-2 text-gray-600">{summary}</p>
      </div>
    </Link>
  );
}