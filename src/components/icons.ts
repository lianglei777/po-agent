import { createElement, forwardRef } from "react";
import {
  AlertTriangle as AlertTriangleIcon,
  Aperture as ApertureIcon,
  ArrowLeft as ArrowLeftIcon,
  AtSign as AtSignIcon,
  Bot as BotIcon,
  Box as BoxIcon,
  Brain as BrainIcon,
  Bold as BoldIcon,
  Check as CheckIcon,
  CheckCircle2 as CheckCircle2Icon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CircleHelp as QuestionCircleIcon,
  Clock3 as Clock3Icon,
  Cloud as CloudIcon,
  Copy as CopyIcon,
  Cpu as CpuIcon,
  Database as DatabaseIcon,
  Download as DownloadIcon,
  ExternalLink as ExternalLinkIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  File as FileIcon,
  FileCode2 as FileCode2Icon,
  FileImage as FileImageIcon,
  FileJson2 as ModelsJsonIcon,
  FileMusic as FileMusicIcon,
  FileText as FileTextIcon,
  FileVideo as FileVideoIcon,
  Film as FilmIcon,
  Flame as FlameIcon,
  FlipHorizontal as FlipHorizontalIcon,
  FlipVertical as FlipVerticalIcon,
  Folder as FolderIcon,
  FolderKanban as ProjectIcon,
  FolderOpen as FolderOpenIcon,
  GitBranch as GitBranchIcon,
  GitFork as GitForkIcon,
  Globe as GlobeIcon,
  Grid as GridIcon,
  Hexagon as HexagonIcon,
  ImagePlus as ImagePlusIcon,
  Images as ImagesIcon,
  Italic as ItalicIcon,
  Key as KeyIcon,
  KeyRound as KeyRoundIcon,
  Keyboard as KeyboardIcon,
  Languages as LanguagesIcon,
  Layers as LayersIcon,
  LineSquiggle as LineSquiggleIcon,
  List as ListIcon,
  ListOrdered as OrderedListIcon,
  LoaderCircle as LoaderCircleIcon,
  Lock as LockIcon,
  Maximize2 as Maximize2Icon,
  MessageSquare as MessageSquareIcon,
  MessageSquarePlus as MessageSquarePlusIcon,
  Minimize2 as Minimize2Icon,
  MoreHorizontal as MoreHorizontalIcon,
  Package as PackageIcon,
  PackageOpen as PackageOpenIcon,
  PanelLeft as PanelLeftIcon,
  PanelLeftClose as PanelLeftCloseIcon,
  PanelLeftOpen as PanelLeftOpenIcon,
  PanelRight as PanelRightIcon,
  PanelRightClose as PanelRightCloseIcon,
  Paperclip as PaperclipIcon,
  Pencil as PencilIcon,
  PencilLine as PencilLineIcon,
  PlayCircle as PlayCircleIcon,
  Plus as PlusIcon,
  Puzzle as PuzzleIcon,
  RefreshCw as RefreshCwIcon,
  RotateCcw as RotateCcwIcon,
  RotateCw as RotateCwIcon,
  Scissors as ScissorsIcon,
  ScrollText as ScrollTextIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Server as ServerIcon,
  ServerCog as ServerCogIcon,
  Settings as SettingsIcon,
  Settings2 as Settings2Icon,
  ShieldAlert as ShieldAlertIcon,
  Sparkles as SparklesIcon,
  Square as SquareIcon,
  SquareDashed as SelectionIcon,
  Terminal as TerminalIcon,
  Trash2 as Trash2Icon,
  Underline as UnderlineIcon,
  X as XIcon,
  Zap as ZapIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// 统一默认尺寸与笔触，既保留原有 1em 布局，也避免各业务模块自行配置后产生视觉漂移。
function createAppIcon(Icon: LucideIcon): LucideIcon {
  const AppIcon = forwardRef<SVGSVGElement, LucideProps>(
    ({ size = "1em", strokeWidth = 1.75, ...props }, ref) =>
      createElement(Icon, { ref, size, strokeWidth, ...props }),
  );
  AppIcon.displayName = `AppIcon(${Icon.displayName ?? Icon.name})`;
  return AppIcon;
}

export const AlertTriangle = createAppIcon(AlertTriangleIcon);
export const Aperture = createAppIcon(ApertureIcon);
export const ArrowLeft = createAppIcon(ArrowLeftIcon);
export const AtSign = createAppIcon(AtSignIcon);
export const Bot = createAppIcon(BotIcon);
export const Box = createAppIcon(BoxIcon);
export const Brain = createAppIcon(BrainIcon);
export const Bold = createAppIcon(BoldIcon);
export const Check = createAppIcon(CheckIcon);
export const CheckCircle2 = createAppIcon(CheckCircle2Icon);
export const ChevronDown = createAppIcon(ChevronDownIcon);
export const ChevronLeft = createAppIcon(ChevronLeftIcon);
export const ChevronRight = createAppIcon(ChevronRightIcon);
export const Clock3 = createAppIcon(Clock3Icon);
export const Cloud = createAppIcon(CloudIcon);
export const Copy = createAppIcon(CopyIcon);
export const Cpu = createAppIcon(CpuIcon);
export const Database = createAppIcon(DatabaseIcon);
export const Film = createAppIcon(FilmIcon);
export const Download = createAppIcon(DownloadIcon);
export const Grid = createAppIcon(GridIcon);
export const Layers = createAppIcon(LayersIcon);
export const ExternalLink = createAppIcon(ExternalLinkIcon);
export const Maximize2 = createAppIcon(Maximize2Icon);
export const List = createAppIcon(ListIcon);
export const Eye = createAppIcon(EyeIcon);
export const EyeOff = createAppIcon(EyeOffIcon);
export const File = createAppIcon(FileIcon);
export const FileCode2 = createAppIcon(FileCode2Icon);
export const FileImage = createAppIcon(FileImageIcon);
export const FileMusic = createAppIcon(FileMusicIcon);
export const FileText = createAppIcon(FileTextIcon);
export const FileVideo = createAppIcon(FileVideoIcon);
export const Flame = createAppIcon(FlameIcon);
export const FlipHorizontal = createAppIcon(FlipHorizontalIcon);
export const FlipVertical = createAppIcon(FlipVerticalIcon);
export const Folder = createAppIcon(FolderIcon);
export const FolderOpen = createAppIcon(FolderOpenIcon);
export const GitBranch = createAppIcon(GitBranchIcon);
export const GitFork = createAppIcon(GitForkIcon);
export const Globe = createAppIcon(GlobeIcon);
export const Hexagon = createAppIcon(HexagonIcon);
export const ImagePlus = createAppIcon(ImagePlusIcon);
export const Images = createAppIcon(ImagesIcon);
export const Italic = createAppIcon(ItalicIcon);
export const Key = createAppIcon(KeyIcon);
export const KeyRound = createAppIcon(KeyRoundIcon);
export const Keyboard = createAppIcon(KeyboardIcon);
export const Lock = createAppIcon(LockIcon);
export const Languages = createAppIcon(LanguagesIcon);
export const LineSquiggle = createAppIcon(LineSquiggleIcon);
export const LoaderCircle = createAppIcon(LoaderCircleIcon);
export const MessageSquare = createAppIcon(MessageSquareIcon);
export const MessageSquarePlus = createAppIcon(MessageSquarePlusIcon);
export const Minimize2 = createAppIcon(Minimize2Icon);
export const ModelsJson = createAppIcon(ModelsJsonIcon);
export const MoreHorizontal = createAppIcon(MoreHorizontalIcon);
export const OrderedList = createAppIcon(OrderedListIcon);
export const Package = createAppIcon(PackageIcon);
export const PackageOpen = createAppIcon(PackageOpenIcon);
export const PanelLeft = createAppIcon(PanelLeftIcon);
export const PanelLeftClose = createAppIcon(PanelLeftCloseIcon);
export const PanelLeftOpen = createAppIcon(PanelLeftOpenIcon);
export const PanelRight = createAppIcon(PanelRightIcon);
export const PanelRightClose = createAppIcon(PanelRightCloseIcon);
export const Paperclip = createAppIcon(PaperclipIcon);
export const Pencil = createAppIcon(PencilIcon);
export const PencilLine = createAppIcon(PencilLineIcon);
export const Plus = createAppIcon(PlusIcon);
export const PlayCircle = createAppIcon(PlayCircleIcon);
export const Project = createAppIcon(ProjectIcon);
export const Puzzle = createAppIcon(PuzzleIcon);
export const QuestionCircle = createAppIcon(QuestionCircleIcon);
export const RefreshCw = createAppIcon(RefreshCwIcon);
export const RotateCcw = createAppIcon(RotateCcwIcon);
export const RotateCw = createAppIcon(RotateCwIcon);
export const ScrollText = createAppIcon(ScrollTextIcon);
export const Scissors = createAppIcon(ScissorsIcon);
export const Search = createAppIcon(SearchIcon);
export const Selection = createAppIcon(SelectionIcon);
export const Send = createAppIcon(SendIcon);
export const Server = createAppIcon(ServerIcon);
export const ServerCog = createAppIcon(ServerCogIcon);
export const Settings = createAppIcon(SettingsIcon);
export const Settings2 = createAppIcon(Settings2Icon);
export const ShieldAlert = createAppIcon(ShieldAlertIcon);
export const Sparkles = createAppIcon(SparklesIcon);
export const Square = createAppIcon(SquareIcon);
export const Terminal = createAppIcon(TerminalIcon);
export const Trash2 = createAppIcon(Trash2Icon);
export const Underline = createAppIcon(UnderlineIcon);
export const UnorderedList = createAppIcon(ListIcon);
export const X = createAppIcon(XIcon);
export const Zap = createAppIcon(ZapIcon);

export type AppIcon = LucideIcon;
