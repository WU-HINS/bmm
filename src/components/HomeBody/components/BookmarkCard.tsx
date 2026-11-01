import Favicon from '@/components/Favicon'
import { useOnClickTag } from '@/hooks/useOnClickTag'
import { getTagLinkAttrs } from '@/utils'
import { useHomePageContext } from '../ctx'

interface Props extends SelectBookmark {
  editable?: boolean
  allTags?: SelectTag[]
  onRemove?: () => void
  onEdit?: () => void
}

/**
 * 书签卡片
 *
 * ! 这张卡片每个页面要渲染几十次，标记体积直接影响 SSR CPU 与传输体积：
 * ! 标签胶囊用原生 <a>（而不是 Chip 组件）、描述悬浮提示用原生 title（而不是 Tooltip 组件）
 */
export default function BookmarkCard(props: Props) {
  const { tags } = useHomePageContext()
  const { onClickTag } = useOnClickTag({ tags })

  const generateLinkTitle = () => {
    const baseTitle = `${props.name} - ${props.description || ''}`
    const tagNames = props.relatedTagIds
      .map((id) => tags.find((tag) => tag.id === id)?.name)
      .filter(Boolean)
    return tagNames.length ? `${baseTitle} (${tagNames.join(', ')})` : baseTitle
  }

  return (
    <div
      className="max-xs:pb-3 max-xs:dark:border-white/8 max-xs:dark:bg-content1/22 xs:hover:-translate-y-0.5 xs:hover:border-slate-200/70 xs:hover:bg-white/26 dark:xs:hover:border-white/12 dark:xs:hover:bg-content1/34 flex cursor-pointer flex-col gap-2 rounded-3xl border border-slate-200/65 bg-white/16 p-4 backdrop-blur-md transition-[background-color,border-color,transform] duration-150 dark:border-white/10 dark:bg-content1/28"
      onClick={() => window.open(props.url, '_blank')}
    >
      <a
        className="flex min-w-0 items-start gap-2"
        href={props.url}
        target="_blank"
        rel="noopener noreferrer"
        title={generateLinkTitle()}
        onClick={(event) => event.stopPropagation()}
      >
        <Favicon src={props.icon} showDefaultIcon alt={`${props.name}网站图标`} />
        <div className="min-w-0 grow">
          <h3 className="text-foreground-700 xs:text-lg truncate" aria-label={`访问${props.name}`}>
            {props.name}
          </h3>
        </div>
      </a>

      <div className="min-h-10">
        {props.description ? (
          <p
            className="text-foreground-500 line-clamp-3 text-xs leading-5.5 break-all"
            role="description"
            title={`${props.name}：${props.description}`}
          >
            {props.description}
          </p>
        ) : (
          <p className="text-default-400 text-xs leading-5.5">打开站点查看详情与内容。</p>
        )}
      </div>

      <div
        className="scrollbar-hide flex max-w-full grow items-end gap-1.5 overflow-auto pt-0.5"
        aria-label="相关标签"
      >
        {props.relatedTagIds.map((id) => {
          const tag = tags.find((tag) => tag.id === id)
          if (!tag) return null
          return (
            <a
              key={tag.id}
              {...getTagLinkAttrs(tag)}
              className="text-foreground-500 xs:hover:text-foreground-700 h-6 shrink-0 rounded-full bg-slate-200/42 px-2 text-xs leading-6 whitespace-nowrap transition active:opacity-50 dark:bg-content2/36"
              onClick={(event) => onClickTag({ tag, event })}
            >
              {tag.name}
            </a>
          )
        })}
      </div>
    </div>
  )
}
